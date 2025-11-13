package utils

import (
	"log/slog"
	"os"
	"strings"
)

// NewLogger returns a slog.Logger configured for the desired verbosity and format.
func NewLogger(level string, json bool) *slog.Logger {
	handlerLevel := slog.LevelInfo
	switch strings.ToLower(level) {
	case "debug":
		handlerLevel = slog.LevelDebug
	case "warn":
		handlerLevel = slog.LevelWarn
	case "error":
		handlerLevel = slog.LevelError
	}

	var handler slog.Handler
	if json {
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: handlerLevel})
	} else {
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: handlerLevel})
	}

	return slog.New(handler)
}
