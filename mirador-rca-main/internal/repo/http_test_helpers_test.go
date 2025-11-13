package repo

import "net/http"

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func newTestClient(rt roundTripFunc) *http.Client {
	return &http.Client{Transport: rt}
}
