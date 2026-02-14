package repository

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newTestStorageService creates a StorageService pointing at the given test server.
// It extracts the host from the server URL and sets it as the emulatorHost so
// that addAuth is a no-op and baseURL returns the test server address.
func newTestStorageService(ts *httptest.Server) *StorageService {
	// Strip "http://" prefix to get host:port for emulatorHost.
	host := strings.TrimPrefix(ts.URL, "http://")
	svc := NewStorageService("test-bucket.firebasestorage.app", host)
	return svc
}

// --- WriteObject ---

func TestWriteObject_Success(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Contains(t, r.URL.Path, "/v0/b/test-bucket.firebasestorage.app/o/")
		assert.Equal(t, "image/png", r.Header.Get("Content-Type"))

		body, _ := io.ReadAll(r.Body)
		assert.Equal(t, "fake-png-data", string(body))

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"name":"projects/uid1/hash1.png"}`))
	}))
	defer ts.Close()

	svc := newTestStorageService(ts)
	err := svc.WriteObject(context.Background(), "projects/uid1/hash1.png", strings.NewReader("fake-png-data"), "image/png")
	assert.NoError(t, err)
}

func TestWriteObject_ServerError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":{"code":500,"message":"Internal error"}}`))
	}))
	defer ts.Close()

	svc := newTestStorageService(ts)
	err := svc.WriteObject(context.Background(), "projects/uid1/hash1.png", strings.NewReader("data"), "image/png")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "upload failed (HTTP 500)")
}

func TestWriteObject_NotFound(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"error":{"code":404,"message":"Not Found."}}`))
	}))
	defer ts.Close()

	svc := newTestStorageService(ts)
	err := svc.WriteObject(context.Background(), "projects/uid1/hash1.png", strings.NewReader("data"), "image/png")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "upload failed (HTTP 404)")
}

func TestWriteObject_Forbidden(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(`{"error":{"code":403,"message":"Permission denied."}}`))
	}))
	defer ts.Close()

	svc := newTestStorageService(ts)
	err := svc.WriteObject(context.Background(), "projects/uid1/hash1.png", strings.NewReader("data"), "image/png")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "upload failed (HTTP 403)")
}

// --- ReadObject ---

func TestReadObject_Success(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Contains(t, r.URL.Path, "/v0/b/test-bucket.firebasestorage.app/o/")
		assert.Equal(t, "media", r.URL.Query().Get("alt"))

		w.Header().Set("Content-Type", "image/png")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("png-bytes"))
	}))
	defer ts.Close()

	svc := newTestStorageService(ts)
	reader, err := svc.ReadObject(context.Background(), "projects/uid1/hash1.png")
	require.NoError(t, err)
	defer reader.Close()

	data, err := io.ReadAll(reader)
	assert.NoError(t, err)
	assert.Equal(t, "png-bytes", string(data))
}

func TestReadObject_NotFound(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"error":{"code":404,"message":"Not Found."}}`))
	}))
	defer ts.Close()

	svc := newTestStorageService(ts)
	reader, err := svc.ReadObject(context.Background(), "projects/uid1/missing.png")
	assert.Error(t, err)
	assert.Nil(t, reader)
	assert.Contains(t, err.Error(), "object not found")
}

func TestReadObject_ServerError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":{"code":500,"message":"Internal"}}`))
	}))
	defer ts.Close()

	svc := newTestStorageService(ts)
	reader, err := svc.ReadObject(context.Background(), "projects/uid1/hash1.png")
	assert.Error(t, err)
	assert.Nil(t, reader)
	assert.Contains(t, err.Error(), "download failed (HTTP 500)")
}

// --- ObjectExists ---

func TestObjectExists_True(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		// Metadata endpoint — no ?alt=media
		assert.Empty(t, r.URL.Query().Get("alt"))

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"name":"projects/uid1/hash1.png","bucket":"test-bucket"}`))
	}))
	defer ts.Close()

	svc := newTestStorageService(ts)
	exists, err := svc.ObjectExists(context.Background(), "projects/uid1/hash1.png")
	assert.NoError(t, err)
	assert.True(t, exists)
}

func TestObjectExists_False(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer ts.Close()

	svc := newTestStorageService(ts)
	exists, err := svc.ObjectExists(context.Background(), "projects/uid1/missing.png")
	assert.NoError(t, err)
	assert.False(t, exists)
}

func TestObjectExists_ServerError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":{"code":500}}`))
	}))
	defer ts.Close()

	svc := newTestStorageService(ts)
	exists, err := svc.ObjectExists(context.Background(), "projects/uid1/hash1.png")
	assert.Error(t, err)
	assert.False(t, exists)
	assert.Contains(t, err.Error(), "metadata check failed (HTTP 500)")
}

// --- DeleteObject ---

func TestDeleteObject_Success(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodDelete, r.Method)
		assert.Contains(t, r.URL.Path, "/v0/b/test-bucket.firebasestorage.app/o/")

		w.WriteHeader(http.StatusNoContent)
	}))
	defer ts.Close()

	svc := newTestStorageService(ts)
	err := svc.DeleteObject(context.Background(), "projects/uid1/hash1.png")
	assert.NoError(t, err)
}

func TestDeleteObject_NotFound_Idempotent(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer ts.Close()

	svc := newTestStorageService(ts)
	err := svc.DeleteObject(context.Background(), "projects/uid1/missing.png")
	assert.NoError(t, err) // idempotent — no error for missing objects
}

func TestDeleteObject_ServerError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":{"code":500}}`))
	}))
	defer ts.Close()

	svc := newTestStorageService(ts)
	err := svc.DeleteObject(context.Background(), "projects/uid1/hash1.png")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "delete failed (HTTP 500)")
}

// --- baseURL ---

func TestBaseURL_Emulator(t *testing.T) {
	svc := NewStorageService("bucket", "localhost:9199")
	assert.Equal(t, "http://localhost:9199", svc.baseURL())
}

func TestBaseURL_Production(t *testing.T) {
	svc := NewStorageService("bucket", "")
	assert.Equal(t, "https://firebasestorage.googleapis.com", svc.baseURL())
}

// --- addAuth ---

func TestAddAuth_EmulatorNoOp(t *testing.T) {
	svc := NewStorageService("bucket", "localhost:9199")
	req, _ := http.NewRequest(http.MethodGet, "http://localhost:9199/test", nil)
	err := svc.addAuth(context.Background(), req)
	assert.NoError(t, err)
	assert.Empty(t, req.Header.Get("Authorization")) // no auth header for emulator
}

// --- URL encoding ---

func TestWriteObject_URLEncoding(t *testing.T) {
	var capturedPath string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.RawPath
		if capturedPath == "" {
			capturedPath = r.URL.Path
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	svc := newTestStorageService(ts)
	err := svc.WriteObject(context.Background(), "projects/uid1/hash1.png", bytes.NewReader(nil), "image/png")
	assert.NoError(t, err)
	// Path should contain URL-encoded slashes (%2F) in the object path
	assert.Contains(t, capturedPath, "projects%2Fuid1%2Fhash1.png")
}

func TestReadObject_URLEncoding(t *testing.T) {
	var capturedPath string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.RawPath
		if capturedPath == "" {
			capturedPath = r.URL.Path
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("data"))
	}))
	defer ts.Close()

	svc := newTestStorageService(ts)
	reader, err := svc.ReadObject(context.Background(), "projects/uid1/hash1.png")
	require.NoError(t, err)
	reader.Close()
	assert.Contains(t, capturedPath, "projects%2Fuid1%2Fhash1.png")
}
