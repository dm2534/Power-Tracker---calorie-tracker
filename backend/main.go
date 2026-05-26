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

	"golang.org/x/oauth2/google"
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
	Text       string `json:"text,omitempty"`
	ImageBase64 string `json:"imageBase64,omitempty"`
	MimeType   string `json:"mimeType,omitempty"`
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
	ID            string `json:"id"`
	DisplayName   string `json:"displayName"`
	HeightCm      int    `json:"heightCm"`
	WeightKg      int    `json:"weightKg"`
	Age           int    `json:"age"`
	Sex           string `json:"sex"`
	Goal          string `json:"goal"`
	ActivityLevel string `json:"activityLevel"`
	CalorieTarget int    `json:"calorieTarget"`
	ProteinPct    int    `json:"proteinPct"`
	CarbsPct      int    `json:"carbsPct"`
	FatPct        int    `json:"fatPct"`
	CreatedAt     string `json:"createdAt"`
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

	mux := http.NewServeMux()
	mux.HandleFunc(healthEndpoint, cors(healthHandler))
	mux.HandleFunc(proxyEndpoint, cors(proxyHandler))
	mux.HandleFunc(analyzeEndpoint, cors(analyzeHandler))
	mux.HandleFunc(userEndpoint, cors(userHandler))
	mux.HandleFunc(logsEndpoint, cors(logsHandler))
	mux.HandleFunc(logsPathPrefix, cors(logsHandler))

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
	body := map[string]any{
		"contents": map[string]any{
			"role": "user",
			"parts": []any{},
		},
		"config": map[string]any{
			"systemInstruction": "You are a precise nutrition analysis AI. Your job is to estimate the caloric and macronutrient content of food from images and/or text descriptions. Be thorough, scientific, and honest about uncertainty. When analyzing images, identify every visible food item and estimate portions using visual cues (plate size, utensils, hands for scale). When only text is given, use standard serving sizes from USDA FoodData Central. Always return a structured JSON response — no prose, no markdown, only raw JSON.",
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
		Suggestions:       []string{"Validate labels for each ingredient.", "Update with a real image for a better estimate."},
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
