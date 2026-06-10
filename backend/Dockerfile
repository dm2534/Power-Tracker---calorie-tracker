FROM node:20-alpine AS frontend-build

WORKDIR /workspace/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.21-alpine AS backend-build

WORKDIR /workspace/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/. .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /backend/backend .

FROM gcr.io/distroless/base-debian11
COPY --from=backend-build /backend/backend /backend
COPY --from=frontend-build /workspace/frontend/dist /static
EXPOSE 8080
ENV API_BACKEND_HOST=0.0.0.0
ENV API_BACKEND_PORT=8080
ENTRYPOINT ["/backend"]
