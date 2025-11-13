package repo

import (
	"context"
	"sync"
	"time"

	"github.com/miradorstack/mirador-rca/internal/cache"
)

type stubCache struct {
	mu    sync.Mutex
	store map[string][]byte
}

func newStubCache() *stubCache {
	return &stubCache{store: make(map[string][]byte)}
}

func (s *stubCache) Get(_ context.Context, key string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	value, ok := s.store[key]
	if !ok {
		return nil, cache.ErrCacheMiss
	}
	copyValue := append([]byte(nil), value...)
	return copyValue, nil
}

func (s *stubCache) Set(_ context.Context, key string, value []byte, _ time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.store[key] = append([]byte(nil), value...)
	return nil
}

func (s *stubCache) SetNX(ctx context.Context, key string, value []byte, ttl time.Duration) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.store[key]; exists {
		return false, nil
	}
	s.store[key] = append([]byte(nil), value...)
	return true, nil
}

func (s *stubCache) Del(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.store, key)
	return nil
}

func (s *stubCache) Close() error { return nil }
