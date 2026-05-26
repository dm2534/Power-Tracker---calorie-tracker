FROM golang:1.21-alpine AS builder

WORKDIR /workspace
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /backend/backend .

FROM gcr.io/distroless/base-debian11
COPY --from=builder /backend/backend /backend
EXPOSE 8080
ENV API_BACKEND_HOST=0.0.0.0
ENV API_BACKEND_PORT=8080
ENTRYPOINT ["/backend"]
