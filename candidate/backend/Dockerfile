FROM golang:1.27-alpine AS build
WORKDIR /src

# Dependencies first so this layer is cached across code changes.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /out/server ./server

EXPOSE 8080
CMD ["./server"]
