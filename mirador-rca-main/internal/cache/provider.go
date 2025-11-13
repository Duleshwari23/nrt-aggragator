package cache

import (
	"context"
	"errors"
	"time"
)

// Provider defines the minimal cache operations needed by the service.
type Provider interface {
	Get(ctx context.Context, key string) ([]byte, error)
	Set(ctx context.Context, key string, value []byte, ttl time.Duration) error
	SetNX(ctx context.Context, key string, value []byte, ttl time.Duration) (bool, error)
	Del(ctx context.Context, key string) error
	Close() error
}

// ErrCacheMiss signals that a cache key was not found.
var ErrCacheMiss = errors.New("cache miss")

// NoopProvider implements Provider but never stores data.
type NoopProvider struct{}

// Get always returns ErrCacheMiss.
func (NoopProvider) Get(context.Context, string) ([]byte, error) {
	return nil, ErrCacheMiss
}

// Set discards the value and returns nil.
func (NoopProvider) Set(context.Context, string, []byte, time.Duration) error {
	return nil
}

// SetNX pretends to store the value and reports success.
func (NoopProvider) SetNX(context.Context, string, []byte, time.Duration) (bool, error) {
	return true, nil
}

// Del is a no-op for the noop cache.
func (NoopProvider) Del(context.Context, string) error { return nil }

// Close is a no-op.
func (NoopProvider) Close() error { return nil }
