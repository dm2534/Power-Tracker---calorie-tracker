package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	envFileName      = ".env.local"
	cloudScope       = "https://www.googleapis.com/auth/cloud-platform"
	healthEndpoint    = "/api/health"
	proxyEndpoint     = "/api-proxy"
	analyzeEndpoint   = "/api/analyze"
	userEndpoint      = "/api/user"
	logsEndpoint      = "/api/logs"
	logsPathPrefix    = "/api/logs/"
	activityEndpoint  = "/api/activity"
	chatEndpoint      = "/api/chat"
	allowedOrigin     = "http://localhost:5173"
	defaultDataFolder = "data"
)

var (
	apiClientMap = []apiClient{
		{
			name:            "VertexGenAi:generateContent",
			patternForProxy: `https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:generateContent`,
			getApiEndpoint: func(context ctxInfo, params map[string]string) string {
				return fmt.Sprintf("https://aiplatform.clients6.google.com/%s/projects/%s/locations/%s/publishers/google/models/%s:generateContent", params["version"], context.projectId, context.region, params["model"])
			},
			isStreaming: false,
		},
		{
			name:            "VertexGenAi:predict",
			patternForProxy: `https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:predict`,
			getApiEndpoint: func(context ctxInfo, params map[string]string) string {
				return fmt.Sprintf("https://aiplatform.clients6.google.com/%s/projects/%s/locations/%s/publishers/google/models/%s:predict", params["version"], context.projectId, context.region, params["model"])
			},
			isStreaming: false,
		},
		{
			name:            "VertexGenAi:streamGenerateContent",
			patternForProxy: `https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:streamGenerateContent`,
			getApiEndpoint: func(context ctxInfo, params map[string]string) string {
				return fmt.Sprintf("https://aiplatform.clients6.google.com/%s/projects/%s/locations/%s/publishers/google/models/%s:streamGenerateContent", params["version"], context.projectId, context.region, params["model"])
			},
			isStreaming: true,
		},
		{
			name:            "ReasoningEngine:query",
			patternForProxy: `https://{{endpoint_location}}-aiplatform.googleapis.com/{{version}}/projects/{{project_id}}/locations/{{location_id}}/reasoningEngines/{{engine_id}}:query`,
			getApiEndpoint: func(context ctxInfo, params map[string]string) string {
				return fmt.Sprintf("https://%s-aiplatform.clients6.google.com/%s/projects/%s/locations/%s/reasoningEngines/%s:query", params["endpoint_location"], params["version"], params["project_id"], params["location_id"], params["engine_id"])
			},
			isStreaming: false,
		},
		{
			name:            "ReasoningEngine:streamQuery",
			patternForProxy: `https://{{endpoint_location}}-aiplatform.googleapis.com/{{version}}/projects/{{project_id}}/locations/{{location_id}}/reasoningEngines/{{engine_id}}:streamQuery`,
			getApiEndpoint: func(context ctxInfo, params map[string]string) string {
				return fmt.Sprintf("https://%s-aiplatform.clients6.google.com/%s/projects/%s/locations/%s/reasoningEngines/%s:streamQuery", params["endpoint_location"], params["version"], params["project_id"], params["location_id"], params["engine_id"])
			},
			isStreaming: true,
		},
	}
)

var (
	config = struct {
		ApiBackendHost string
		ApiBackendPort string
		GoogleCloudLocation string
		GoogleCloudProject string
		ProxyHeader string
	}{
		ApiBackendHost: "0.0.0.0",
		ApiBackendPort: "5000",
	}
	firestoreClient *firestore.Client
)

type apiClient struct {
	name            string
	patternForProxy string
	compiledRegex   *regexp.Regexp
	paramOrder      []string
	getApiEndpoint  func(ctxInfo, map[string]string) string
	isStreaming     bool
}

type ctxInfo struct {
	projectId string
	region    string
}

type proxyRequest struct {
	OriginalUrl string          `json:"originalUrl"`
	Method      string          `json:"method"`
	Headers     json.RawMessage `json:"headers"`
	Body        json.RawMessage `json:"body"`
}

type analyzeRequest struct {
	Text        string `json:"text,omitempty"`
	ImageBase64 string `json:"imageBase64,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
	DietType    string `json:"dietType,omitempty"`
}

type FoodItem struct {
	Name          string `json:"name"`
	Quantity      string `json:"quantity"`
	QuantityGrams int    `json:"quantity_grams"`
	Calories      int    `json:"calories"`
	ProteinG      int    `json:"protein_g"`
	CarbsG        int    `json:"carbs_g"`
	FatG          int    `json:"fat_g"`
	FiberG        int    `json:"fiber_g"`
	SugarG        int    `json:"sugar_g"`
	Confidence    string `json:"confidence"`
	Notes         string `json:"notes"`
}

type GeminiNutritionResponse struct {
	FoodItems         []FoodItem `json:"food_items"`
	Totals            struct {
		Calories int `json:"calories"`
		ProteinG int `json:"protein_g"`
		CarbsG   int `json:"carbs_g"`
		FatG     int `json:"fat_g"`
		FiberG   int `json:"fiber_g"`
		SugarG   int `json:"sugar_g"`
	} `json:"totals"`
	OverallConfidence string   `json:"overall_confidence"`
	Reasoning         string   `json:"reasoning"`
	Suggestions       []string `json:"suggestions"`
}

type UserProfile struct {
	ID             string `json:"id"`
	DisplayName    string `json:"displayName"`
	HeightCm       int    `json:"heightCm"`
	WeightKg       int    `json:"weightKg"`
	TargetWeightKg int    `json:"targetWeightKg"`
	BirthDate      string `json:"birthDate"`
	Age            int    `json:"age"`
	Sex            string `json:"sex"`
	Goal           string `json:"goal"`
	DietType       string `json:"dietType"`
	ActivityLevel  string `json:"activityLevel"`
	CalorieTarget  int    `json:"calorieTarget"`
	ProteinPct     int    `json:"proteinPct"`
	CarbsPct       int    `json:"carbsPct"`
	FatPct         int    `json:"fatPct"`
	CreatedAt      string `json:"createdAt"`
}

type DailyActivity struct {
	ID              string `json:"id,omitempty" firestore:"id,omitempty"`
	UserID          string `json:"userId" firestore:"userId"`
	LogDate         string `json:"logDate" firestore:"logDate"`
	CaloriesBurnt   int    `json:"caloriesBurnt" firestore:"caloriesBurnt"`
	WaterIngestedMl int    `json:"waterIngestedMl" firestore:"waterIngestedMl"`
	Steps           int    `json:"steps" firestore:"steps"`
	UpdatedAt       string `json:"updatedAt" firestore:"updatedAt"`
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Messages []ChatMessage `json:"messages"`
}

type FoodLog struct {
	ID             string                   `json:"id"`
	UserID         string                   `json:"userId"`
	LoggedAt       string                   `json:"loggedAt"`
	EntryType      string                   `json:"entryType"`
	ImageUrl       string                   `json:"imageUrl,omitempty"`
	RawInput       string                   `json:"rawInput,omitempty"`
	GeminiResponse GeminiNutritionResponse  `json:"geminiResponse"`
	Calories       int                      `json:"calories"`
	ProteinG       int                      `json:"proteinG"`
	CarbsG         int                      `json:"carbsG"`
	FatG           int                      `json:"fatG"`
	FoodName       string                   `json:"foodName"`
}

func main() {
	loadEnvFile(envFileName)
	populateConfig()
	ensureDataFolder(defaultDataFolder)
	compilePatterns()
	initFirestore(context.Background())
	defer closeFirestore()

	mux := http.NewServeMux()
	mux.HandleFunc(healthEndpoint, cors(healthHandler))
	mux.HandleFunc(proxyEndpoint, cors(proxyHandler))
	mux.HandleFunc(analyzeEndpoint, cors(analyzeHandler))
	mux.HandleFunc(userEndpoint, cors(userHandler))
	mux.HandleFunc(logsEndpoint, cors(logsHandler))
	mux.HandleFunc(logsPathPrefix, cors(logsHandler))
	mux.HandleFunc(activityEndpoint, cors(activityHandler))
	mux.HandleFunc(chatEndpoint, cors(chatHandler))

	addr := fmt.Sprintf("%s:%s", config.ApiBackendHost, config.ApiBackendPort)
	log.Printf("Go backend listening at http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func loadEnvFile(path string) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}

	lines := strings.Split(string(raw), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "//") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		value = strings.Trim(value, `"`)
		if _, exists := os.LookupEnv(key); !exists {
			os.Setenv(key, value)
		}
	}
}

func populateConfig() {
	if val := os.Getenv("API_BACKEND_HOST"); val != "" {
		config.ApiBackendHost = val
	}
	if val := os.Getenv("PORT"); val != "" {
		config.ApiBackendPort = val
	} else if val := os.Getenv("API_BACKEND_PORT"); val != "" {
		config.ApiBackendPort = val
	}
	config.GoogleCloudLocation = os.Getenv("GOOGLE_CLOUD_LOCATION")
	config.GoogleCloudProject = os.Getenv("GOOGLE_CLOUD_PROJECT")
	config.ProxyHeader = os.Getenv("PROXY_HEADER")
}

func initFirestore(ctx context.Context) {
	if config.GoogleCloudProject == "" {
		log.Println("Firestore disabled: GOOGLE_CLOUD_PROJECT is not set")
		return
	}

	client, err := firestore.NewClient(ctx, config.GoogleCloudProject)
	if err != nil {
		log.Printf("Firestore initialization failed: %v", err)
		return
	}
	firestoreClient = client
	log.Println("Firestore connected")
}

func closeFirestore() {
	if firestoreClient != nil {
		_ = firestoreClient.Close()
	}
}

func compilePatterns() {
	for i, client := range apiClientMap {
		r, params, err := parsePattern(client.patternForProxy)
		if err != nil {
			log.Fatalf("failed to compile proxy pattern: %v", err)
		}
		apiClientMap[i].compiledRegex = r
		apiClientMap[i].paramOrder = params
	}
}

func cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-App-Proxy")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func proxyHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	if config.ProxyHeader == "" {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "PROXY_HEADER must be configured"})
		return
	}

	if r.Header.Get("X-App-Proxy") != config.ProxyHeader {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	var request proxyRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON request"})
		return
	}

	if request.OriginalUrl == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "originalUrl is required"})
		return
	}

	client, params := matchProxyClient(request.OriginalUrl)
	if client == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no proxy handler found"})
		return
	}

	accessToken, err := getAccessToken(r.Context())
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}

	apiURL := client.getApiEndpoint(ctxInfo{projectId: config.GoogleCloudProject, region: config.GoogleCloudLocation}, params)
	proxyReq, err := http.NewRequest(request.MethodOrDefault(), apiURL, bytes.NewReader(request.Body))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create upstream request"})
		return
	}
	proxyReq.Header.Set("Authorization", "Bearer "+accessToken)
	proxyReq.Header.Set("X-Goog-User-Project", config.GoogleCloudProject)
	proxyReq.Header.Set("Content-Type", "application/json")

	if len(request.Headers) > 0 {
		var extraHeaders map[string]string
		if err := json.Unmarshal(request.Headers, &extraHeaders); err == nil {
			for k, v := range extraHeaders {
				proxyReq.Header.Set(k, v)
			}
		}
	}

	resp, err := http.DefaultClient.Do(proxyReq)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	copyResponse(w, resp)
}

func analyzeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	var req analyzeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON request"})
		return
	}

	if req.Text == "" && req.ImageBase64 == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "text or imageBase64 is required"})
		return
	}

	if config.GoogleCloudProject != "" && config.GoogleCloudLocation != "" && config.ProxyHeader != "" {
		if data, err := callVertexAnalyze(r.Context(), req); err == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write(data)
			return
		}
	}

	response := mockNutritionResponse(req)
	writeJSON(w, http.StatusOK, response)
}

func userHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		id := r.URL.Query().Get("id")
		if firestoreClient != nil && id != "" {
			doc, err := firestoreClient.Collection("users").Doc(id).Get(r.Context())
			if err != nil {
				if status.Code(err) == codes.NotFound {
					writeJSON(w, http.StatusOK, map[string]interface{}{"user": nil})
					return
				}
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			var profile UserProfile
			if err := doc.DataTo(&profile); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, profile)
			return
		}

		user, err := readUserProfile()
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				writeJSON(w, http.StatusOK, map[string]interface{}{"user": nil})
				return
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, user)
	case http.MethodPost:
		var profile UserProfile
		if err := json.NewDecoder(r.Body).Decode(&profile); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON request"})
			return
		}
		if profile.ID == "" {
			profile.ID = randomID("user_")
		}
		if profile.CreatedAt == "" {
			profile.CreatedAt = time.Now().UTC().Format(time.RFC3339)
		}
		if firestoreClient != nil {
			_, err := firestoreClient.Collection("users").Doc(profile.ID).Set(r.Context(), profile)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, profile)
			return
		}

		if err := writeJSONFile(filepath.Join(defaultDataFolder, "user.json"), profile); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, profile)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
	}
}

func logsHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		userId := r.URL.Query().Get("userId")
		if firestoreClient != nil {
			query := firestoreClient.Collection("logs").Query
			if userId != "" {
				query = query.Where("userId", "==", userId)
			}
			query = query.OrderBy("loggedAt", firestore.Desc)
			iter := query.Documents(r.Context())
			defer iter.Stop()
			logs := []FoodLog{}
			for {
				doc, err := iter.Next()
				if err == iterator.Done {
					break
				}
				if err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
					return
				}
				var logItem FoodLog
				if err := doc.DataTo(&logItem); err != nil {
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
					return
				}
				logs = append(logs, logItem)
			}
			writeJSON(w, http.StatusOK, logs)
			return
		}

		logs, err := readLogs()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, logs)
	case http.MethodPost:
		var logItem FoodLog
		if err := json.NewDecoder(r.Body).Decode(&logItem); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON request"})
			return
		}
		if logItem.ID == "" {
			logItem.ID = randomID("log_")
		}
		if firestoreClient != nil {
			_, err := firestoreClient.Collection("logs").Doc(logItem.ID).Set(r.Context(), logItem)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, logItem)
			return
		}
		logs, _ := readLogs()
		logs = append([]FoodLog{logItem}, logs...)
		if err := writeJSONFile(filepath.Join(defaultDataFolder, "logs.json"), logs); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, logItem)
	case http.MethodDelete:
		id := strings.TrimPrefix(r.URL.Path, logsPathPrefix)
		if id == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id is required"})
			return
		}
		if firestoreClient != nil {
			_, err := firestoreClient.Collection("logs").Doc(id).Delete(r.Context())
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"deleted": id})
			return
		}
		logs, err := readLogs()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		filtered := make([]FoodLog, 0, len(logs))
		for _, item := range logs {
			if item.ID != id {
				filtered = append(filtered, item)
			}
		}
		if err := writeJSONFile(filepath.Join(defaultDataFolder, "logs.json"), filtered); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"deleted": id})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
	}
}

func randomID(prefix string) string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%s%d", prefix, time.Now().UnixNano())
	}
	return prefix + hex.EncodeToString(buf)
}

func ensureDataFolder(folder string) {
	if err := os.MkdirAll(folder, 0755); err != nil {
		log.Fatalf("failed to create data folder: %v", err)
	}
}

func parsePattern(pattern string) (*regexp.Regexp, []string, error) {
	reParam := regexp.MustCompile(`\{\{([^}]+)\}\}`)
	params := make([]string, 0)
	regexPattern := "^"
	lastIndex := 0
	for _, m := range reParam.FindAllStringSubmatchIndex(pattern, -1) {
		regexPattern += regexp.QuoteMeta(pattern[lastIndex:m[0]])
		params = append(params, pattern[m[2]:m[3]])
		regexPattern += `([^/]+)`
		lastIndex = m[1]
	}
	regexPattern += regexp.QuoteMeta(pattern[lastIndex:])
	regexPattern += `$`
	compiled, err := regexp.Compile(regexPattern)
	return compiled, params, err
}

func matchProxyClient(originalUrl string) (*apiClient, map[string]string) {
	for i := range apiClientMap {
		client := &apiClientMap[i]
		if client.compiledRegex == nil {
			continue
		}
		matches := client.compiledRegex.FindStringSubmatch(originalUrl)
		if matches == nil {
			continue
		}
		params := make(map[string]string)
		for index, name := range client.paramOrder {
			params[name] = matches[index+1]
		}
		return client, params
	}
	return nil, nil
}

func getAccessToken(ctx context.Context) (string, error) {
	creds, err := google.FindDefaultCredentials(ctx, cloudScope)
	if err != nil {
		return "", err
	}
	token, err := creds.TokenSource.Token()
	if err != nil {
		return "", err
	}
	return token.AccessToken, nil
}

func (req *proxyRequest) MethodOrDefault() string {
	if req.Method == "" {
		return http.MethodPost
	}
	return req.Method
}

func copyResponse(w http.ResponseWriter, resp *http.Response) {
	for key, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func callVertexAnalyze(ctx context.Context, req analyzeRequest) ([]byte, error) {
	systemPrompt := "You are a precise nutrition analysis AI. Your job is to estimate the caloric and macronutrient content of food from images and/or text descriptions. Be thorough, scientific, and honest about uncertainty. When analyzing images, identify every visible food item and estimate portions using visual cues (plate size, utensils, hands for scale). When only text is given, use standard serving sizes from USDA FoodData Central. Always return a structured JSON response — no prose, no markdown, only raw JSON."
	if req.DietType != "" && req.DietType != "none" {
		systemPrompt += fmt.Sprintf(" Additionally, evaluate if the food items adhere to a '%s' diet. Add tips/warnings under 'suggestions' if any item violates this diet.", req.DietType)
	}

	body := map[string]any{
		"contents": map[string]any{
			"role": "user",
			"parts": []any{},
		},
		"config": map[string]any{
			"systemInstruction": systemPrompt,
			"temperature": 0.1,
			"maxOutputTokens": 2048,
			"responseMimeType": "application/json",
			"responseSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"food_items": map[string]any{"type": "array"},
					"totals": map[string]any{"type": "object"},
					"overall_confidence": map[string]any{"type": "string"},
					"reasoning": map[string]any{"type": "string"},
					"suggestions": map[string]any{"type": "array"},
				},
			},
		},
	}

	parts := []any{}
	if req.Text != "" {
		parts = append(parts, map[string]any{"text": req.Text})
	}
	if req.ImageBase64 != "" {
		parts = append(parts, map[string]any{"inlineData": map[string]any{"data": req.ImageBase64, "mimeType": req.MimeType}})
	}
	body["contents"].(map[string]any)["parts"] = parts

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	proxyReq := proxyRequest{
		OriginalUrl: fmt.Sprintf("https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-pro:generateContent"),
		Method:      http.MethodPost,
		Headers:     json.RawMessage(`{}`),
		Body:        bodyBytes,
	}

	proxyRequestBody, err := json.Marshal(proxyReq)
	if err != nil {
		return nil, err
	}

	reqBody := bytes.NewReader(proxyRequestBody)
	forwardReq, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("http://%s:%s%s", config.ApiBackendHost, config.ApiBackendPort, proxyEndpoint), reqBody)
	if err != nil {
		return nil, err
	}
	forwardReq.Header.Set("Content-Type", "application/json")
	forwardReq.Header.Set("X-App-Proxy", config.ProxyHeader)

	resp, err := http.DefaultClient.Do(forwardReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		payload, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("vertex proxy error %d: %s", resp.StatusCode, string(payload))
	}

	return io.ReadAll(resp.Body)
}

func mockNutritionResponse(req analyzeRequest) GeminiNutritionResponse {
	itemName := "UNKNOWN MEAL"
	if req.Text != "" {
		itemName = strings.ToUpper(strings.Split(req.Text, ".")[0])
		if len(itemName) > 30 {
			itemName = itemName[:30]
		}
	}
	suggestions := []string{"Validate labels for each ingredient.", "Update with a real image for a better estimate."}
	if req.DietType != "" && req.DietType != "none" {
		suggestions = append(suggestions, fmt.Sprintf("Adherence to %s diet: High compliance estimated.", strings.ToUpper(req.DietType)))
	}
	return GeminiNutritionResponse{
		FoodItems: []FoodItem{{
			Name:          itemName,
			Quantity:      "1 serving",
			QuantityGrams: 350,
			Calories:      560,
			ProteinG:      34,
			CarbsG:        48,
			FatG:          18,
			FiberG:        5,
			SugarG:        8,
			Confidence:    "medium",
			Notes:         "Estimated from description and standard serving sizes.",
		}},
		Totals: struct {
			Calories int `json:"calories"`
			ProteinG int `json:"protein_g"`
			CarbsG   int `json:"carbs_g"`
			FatG     int `json:"fat_g"`
			FiberG   int `json:"fiber_g"`
			SugarG   int `json:"sugar_g"`
		}{
			Calories: 560,
			ProteinG: 34,
			CarbsG:   48,
			FatG:     18,
			FiberG:   5,
			SugarG:   8,
		},
		OverallConfidence: "medium",
		Reasoning:         "This response is generated by a fallback server-side mock when Google Cloud credentials or proxy headers were not fully configured.",
		Suggestions:       suggestions,
	}
}

func readUserProfile() (*UserProfile, error) {
	path := filepath.Join(defaultDataFolder, "user.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var profile UserProfile
	if err := json.Unmarshal(data, &profile); err != nil {
		return nil, err
	}
	return &profile, nil
}

func readLogs() ([]FoodLog, error) {
	path := filepath.Join(defaultDataFolder, "logs.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []FoodLog{}, nil
		}
		return nil, err
	}
	var logs []FoodLog
	if err := json.Unmarshal(data, &logs); err != nil {
		return nil, err
	}
	return logs, nil
}

func writeJSONFile(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}

func readActivities() ([]DailyActivity, error) {
	path := filepath.Join(defaultDataFolder, "activity.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []DailyActivity{}, nil
		}
		return nil, err
	}
	var activities []DailyActivity
	if err := json.Unmarshal(data, &activities); err != nil {
		return nil, err
	}
	return activities, nil
}

func activityHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		userId := r.URL.Query().Get("userId")
		date := r.URL.Query().Get("date")
		if userId == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "userId is required"})
			return
		}

		if date == "" {
			if firestoreClient != nil {
				iter := firestoreClient.Collection("activities").
					Where("userId", "==", userId).
					Documents(r.Context())
				defer iter.Stop()
				acts := []DailyActivity{}
				for {
					doc, err := iter.Next()
					if err == iterator.Done {
						break
					}
					if err != nil {
						writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
						return
					}
					var act DailyActivity
					if err := doc.DataTo(&act); err != nil {
						writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
						return
					}
					acts = append(acts, act)
				}
				writeJSON(w, http.StatusOK, acts)
				return
			}

			acts, err := readActivities()
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			userActs := []DailyActivity{}
			for _, a := range acts {
				if a.UserID == userId {
					userActs = append(userActs, a)
				}
			}
			writeJSON(w, http.StatusOK, userActs)
			return
		}

		if firestoreClient != nil {
			iter := firestoreClient.Collection("activities").
				Where("userId", "==", userId).
				Where("logDate", "==", date).
				Limit(1).
				Documents(r.Context())
			defer iter.Stop()
			doc, err := iter.Next()
			if err == iterator.Done {
				writeJSON(w, http.StatusOK, DailyActivity{UserID: userId, LogDate: date})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			var act DailyActivity
			if err := doc.DataTo(&act); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, act)
			return
		}

		acts, err := readActivities()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		for _, a := range acts {
			if a.UserID == userId && a.LogDate == date {
				writeJSON(w, http.StatusOK, a)
				return
			}
		}
		writeJSON(w, http.StatusOK, DailyActivity{UserID: userId, LogDate: date})

	case http.MethodPost:
		var act DailyActivity
		if err := json.NewDecoder(r.Body).Decode(&act); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON request"})
			return
		}
		if act.UserID == "" || act.LogDate == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "userId and logDate are required"})
			return
		}
		if act.ID == "" {
			act.ID = randomID("act_")
		}
		act.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

		if firestoreClient != nil {
			_, err := firestoreClient.Collection("activities").Doc(act.ID).Set(r.Context(), act)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, act)
			return
		}

		acts, _ := readActivities()
		updated := false
		for i, a := range acts {
			if a.UserID == act.UserID && a.LogDate == act.LogDate {
				if act.ID == "" {
					act.ID = a.ID
				}
				acts[i] = act
				updated = true
				break
			}
		}
		if !updated {
			acts = append(acts, act)
		}

		if err := writeJSONFile(filepath.Join(defaultDataFolder, "activity.json"), acts); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, act)

	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
	}
}

func callVertexChat(ctx context.Context, messages []ChatMessage) ([]byte, error) {
	contents := []any{}
	for _, msg := range messages {
		role := msg.Role
		if role == "assistant" || role == "bot" {
			role = "model"
		}
		contents = append(contents, map[string]any{
			"role": role,
			"parts": []any{
				map[string]any{"text": msg.Content},
			},
		})
	}

	body := map[string]any{
		"contents": contents,
		"systemInstruction": map[string]any{
			"parts": []any{
				map[string]any{"text": "You are a helpful nutrition and fitness coach chatbot. Answer health, fitness, diet, and training questions based on science. Keep it motivational and concise, matching a warrior mindset (soul, determination, strength)."},
			},
		},
		"generationConfig": map[string]any{
			"temperature": 0.7,
			"maxOutputTokens": 2048,
		},
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	proxyReq := proxyRequest{
		OriginalUrl: fmt.Sprintf("https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-pro:generateContent"),
		Method:      http.MethodPost,
		Headers:     json.RawMessage(`{}`),
		Body:        bodyBytes,
	}

	proxyRequestBody, err := json.Marshal(proxyReq)
	if err != nil {
		return nil, err
	}

	reqBody := bytes.NewReader(proxyRequestBody)
	forwardReq, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("http://%s:%s%s", config.ApiBackendHost, config.ApiBackendPort, proxyEndpoint), reqBody)
	if err != nil {
		return nil, err
	}
	forwardReq.Header.Set("Content-Type", "application/json")
	forwardReq.Header.Set("X-App-Proxy", config.ProxyHeader)

	resp, err := http.DefaultClient.Do(forwardReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		payload, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("vertex proxy error %d: %s", resp.StatusCode, string(payload))
	}

	return io.ReadAll(resp.Body)
}

func mockChatResponse(messages []ChatMessage) string {
	lastMsg := ""
	if len(messages) > 0 {
		lastMsg = strings.ToLower(messages[len(messages)-1].Content)
	}

	if strings.Contains(lastMsg, "hello") || strings.Contains(lastMsg, "hi") {
		return "Greetings, warrior! I am your Soul Feast Training Coach. What targets shall we conquer today?"
	}
	if strings.Contains(lastMsg, "protein") || strings.Contains(lastMsg, "macro") {
		return "Protein is the fuel for muscle recovery. Aim for 1.6 to 2.2 grams per kilogram of bodyweight. Consuming egg whites, chicken breast, or lean tofu is a powerful way to hit your target!"
	}
	if strings.Contains(lastMsg, "keto") || strings.Contains(lastMsg, "carb") {
		return "To maintain fat-adaption, restrict net carbs below 50 grams per day. Focus on healthy fats like avocado, nuts, and clean oils, while tracking your energy output!"
	}
	if strings.Contains(lastMsg, "water") || strings.Contains(lastMsg, "hydrate") {
		return "Hydration maintains cellular pressure and peak recovery. Log at least 2500ml on training days to unleash maximum power."
	}
	if strings.Contains(lastMsg, "steps") || strings.Contains(lastMsg, "cardio") {
		return "Cardiovascular capacity raises your active threshold. 8,000 to 10,000 steps daily is a reliable baseline for general compliance."
	}
	if strings.Contains(lastMsg, "cut") || strings.Contains(lastMsg, "bulk") {
		return "A successful cut demands a steady active deficit of 300-500 kcal, preserving high protein to guard muscle mass. A clean bulk requires a surplus of 200-400 kcal combined with rigorous training."
	}

	return "To conquer your fitness goals, maintain consistent daily logs of your intake and active burn, track macros closely, and keep pushing your physical limits!"
}

func chatHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON request"})
		return
	}

	if len(req.Messages) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "messages are required"})
		return
	}

	if config.GoogleCloudProject != "" && config.GoogleCloudLocation != "" && config.ProxyHeader != "" {
		if data, err := callVertexChat(r.Context(), req.Messages); err == nil {
			var vertexResp struct {
				Candidates []struct {
					Content struct {
						Parts []struct {
							Text string `json:"text"`
						} `json:"parts"`
					} `json:"content"`
				} `json:"candidates"`
			}
			if err := json.Unmarshal(data, &vertexResp); err == nil && len(vertexResp.Candidates) > 0 && len(vertexResp.Candidates[0].Content.Parts) > 0 {
				replyText := vertexResp.Candidates[0].Content.Parts[0].Text
				writeJSON(w, http.StatusOK, map[string]string{"reply": replyText})
				return
			}
			log.Printf("Vertex chat response parsing failed, falling back. Error parsing raw data: %s", string(data))
		} else {
			log.Printf("Vertex chat call failed, falling back: %v", err)
		}
	}

	reply := mockChatResponse(req.Messages)
	writeJSON(w, http.StatusOK, map[string]string{"reply": reply})
}
