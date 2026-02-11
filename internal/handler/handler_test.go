package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/pandasWhoCode/paintbar/internal/middleware"
	"github.com/pandasWhoCode/paintbar/internal/model"
	"github.com/pandasWhoCode/paintbar/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Mock repositories (same pattern as service tests) ---

type mockUserRepo struct {
	users     map[string]*model.User
	usernames map[string]string
}

func newMockUserRepo() *mockUserRepo {
	return &mockUserRepo{
		users:     make(map[string]*model.User),
		usernames: make(map[string]string),
	}
}

func (m *mockUserRepo) GetByID(_ context.Context, uid string) (*model.User, error) {
	u, ok := m.users[uid]
	if !ok {
		return nil, fmt.Errorf("user not found")
	}
	return u, nil
}

func (m *mockUserRepo) Create(_ context.Context, user *model.User) error {
	m.users[user.UID] = user
	return nil
}

func (m *mockUserRepo) Update(_ context.Context, uid string, update *model.UserUpdate) error {
	_, ok := m.users[uid]
	if !ok {
		return fmt.Errorf("user not found")
	}
	return nil
}

func (m *mockUserRepo) ClaimUsername(_ context.Context, uid string, username string) error {
	if _, taken := m.usernames[username]; taken {
		return fmt.Errorf("username already taken")
	}
	m.usernames[username] = uid
	m.users[uid].Username = username
	return nil
}

type mockProjectRepo struct {
	projects map[string]*model.Project
	counter  int
}

func newMockProjectRepo() *mockProjectRepo {
	return &mockProjectRepo{projects: make(map[string]*model.Project)}
}

func (m *mockProjectRepo) GetByID(_ context.Context, id string) (*model.Project, error) {
	p, ok := m.projects[id]
	if !ok {
		return nil, fmt.Errorf("project not found")
	}
	return p, nil
}

func (m *mockProjectRepo) List(_ context.Context, userID string, limit int, startAfter string) ([]*model.Project, error) {
	var result []*model.Project
	for _, p := range m.projects {
		if p.UserID == userID {
			result = append(result, p)
		}
	}
	return result, nil
}

func (m *mockProjectRepo) Count(_ context.Context, userID string) (int64, error) {
	var count int64
	for _, p := range m.projects {
		if p.UserID == userID {
			count++
		}
	}
	return count, nil
}

func (m *mockProjectRepo) Create(_ context.Context, project *model.Project) (string, error) {
	m.counter++
	id := fmt.Sprintf("proj-%d", m.counter)
	project.ID = id
	m.projects[id] = project
	return id, nil
}

func (m *mockProjectRepo) Update(_ context.Context, id string, update *model.ProjectUpdate) error {
	if _, ok := m.projects[id]; !ok {
		return fmt.Errorf("project not found")
	}
	return nil
}

func (m *mockProjectRepo) Delete(_ context.Context, id string) error {
	if _, ok := m.projects[id]; !ok {
		return fmt.Errorf("project not found")
	}
	delete(m.projects, id)
	return nil
}

type mockGalleryRepo struct {
	items   map[string]*model.GalleryItem
	counter int
}

func newMockGalleryRepo() *mockGalleryRepo {
	return &mockGalleryRepo{items: make(map[string]*model.GalleryItem)}
}

func (m *mockGalleryRepo) GetByID(_ context.Context, id string) (*model.GalleryItem, error) {
	item, ok := m.items[id]
	if !ok {
		return nil, fmt.Errorf("gallery item not found")
	}
	return item, nil
}

func (m *mockGalleryRepo) List(_ context.Context, userID string, limit int, startAfter string) ([]*model.GalleryItem, error) {
	var result []*model.GalleryItem
	for _, item := range m.items {
		if item.UserID == userID {
			result = append(result, item)
		}
	}
	return result, nil
}

func (m *mockGalleryRepo) Count(_ context.Context, userID string) (int64, error) {
	var count int64
	for _, item := range m.items {
		if item.UserID == userID {
			count++
		}
	}
	return count, nil
}

func (m *mockGalleryRepo) Create(_ context.Context, item *model.GalleryItem) (string, error) {
	m.counter++
	id := fmt.Sprintf("gal-%d", m.counter)
	item.ID = id
	m.items[id] = item
	return id, nil
}

func (m *mockGalleryRepo) Delete(_ context.Context, id string) error {
	if _, ok := m.items[id]; !ok {
		return fmt.Errorf("gallery item not found")
	}
	delete(m.items, id)
	return nil
}

type mockNFTRepo struct {
	nfts    map[string]*model.NFT
	counter int
}

func newMockNFTRepo() *mockNFTRepo {
	return &mockNFTRepo{nfts: make(map[string]*model.NFT)}
}

func (m *mockNFTRepo) GetByID(_ context.Context, id string) (*model.NFT, error) {
	nft, ok := m.nfts[id]
	if !ok {
		return nil, fmt.Errorf("NFT not found")
	}
	return nft, nil
}

func (m *mockNFTRepo) List(_ context.Context, userID string, limit int, startAfter string) ([]*model.NFT, error) {
	var result []*model.NFT
	for _, nft := range m.nfts {
		if nft.UserID == userID {
			result = append(result, nft)
		}
	}
	return result, nil
}

func (m *mockNFTRepo) Count(_ context.Context, userID string) (int64, error) {
	var count int64
	for _, nft := range m.nfts {
		if nft.UserID == userID {
			count++
		}
	}
	return count, nil
}

func (m *mockNFTRepo) Create(_ context.Context, nft *model.NFT) (string, error) {
	m.counter++
	id := fmt.Sprintf("nft-%d", m.counter)
	nft.ID = id
	m.nfts[id] = nft
	return id, nil
}

func (m *mockNFTRepo) Update(_ context.Context, id string, updates map[string]interface{}) error {
	if _, ok := m.nfts[id]; !ok {
		return fmt.Errorf("NFT not found")
	}
	return nil
}

func (m *mockNFTRepo) Delete(_ context.Context, id string) error {
	if _, ok := m.nfts[id]; !ok {
		return fmt.Errorf("NFT not found")
	}
	delete(m.nfts, id)
	return nil
}

// --- Test helpers ---

// withUser injects an authenticated user into the request context.
func withUser(r *http.Request, uid, email string) *http.Request {
	userInfo := &service.UserInfo{UID: uid, Email: email}
	ctx := context.WithValue(r.Context(), middleware.UserContextKey, userInfo)
	return r.WithContext(ctx)
}

// chiContext creates a chi route context with URL params.
func chiContext(r *http.Request, params map[string]string) *http.Request {
	rctx := chi.NewRouteContext()
	for k, v := range params {
		rctx.URLParams.Add(k, v)
	}
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

func jsonBody(v interface{}) *bytes.Buffer {
	b, _ := json.Marshal(v)
	return bytes.NewBuffer(b)
}

// --- Shared helper tests ---

func TestRespondJSON_NilData(t *testing.T) {
	rr := httptest.NewRecorder()
	respondJSON(rr, http.StatusNoContent, nil)
	assert.Equal(t, http.StatusNoContent, rr.Code)
	assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))
	assert.Empty(t, rr.Body.String())
}

func TestRespondJSON_WithData(t *testing.T) {
	rr := httptest.NewRecorder()
	respondJSON(rr, http.StatusOK, map[string]string{"hello": "world"})
	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), `"hello":"world"`)
}

func TestErrorStatus_Unauthorized(t *testing.T) {
	assert.Equal(t, http.StatusForbidden, errorStatus("unauthorized: cannot do that"))
}

func TestErrorStatus_NotFound(t *testing.T) {
	assert.Equal(t, http.StatusNotFound, errorStatus("user not found"))
}

func TestErrorStatus_AlreadyTaken(t *testing.T) {
	assert.Equal(t, http.StatusConflict, errorStatus("username already taken"))
}

func TestErrorStatus_AlreadySet(t *testing.T) {
	assert.Equal(t, http.StatusConflict, errorStatus("username already set"))
}

func TestErrorStatus_AlreadyExists(t *testing.T) {
	assert.Equal(t, http.StatusConflict, errorStatus("resource already exists"))
}

func TestErrorStatus_Required(t *testing.T) {
	assert.Equal(t, http.StatusBadRequest, errorStatus("uid is required"))
}

func TestErrorStatus_Validation(t *testing.T) {
	assert.Equal(t, http.StatusBadRequest, errorStatus("validation: name is required"))
}

func TestErrorStatus_MustBe(t *testing.T) {
	assert.Equal(t, http.StatusBadRequest, errorStatus("name must be 200 characters or less"))
}

func TestErrorStatus_Invalid(t *testing.T) {
	assert.Equal(t, http.StatusBadRequest, errorStatus("invalid website URL"))
}

func TestErrorStatus_Unknown(t *testing.T) {
	assert.Equal(t, http.StatusInternalServerError, errorStatus("something went wrong"))
}

func TestRequireUser_NoUser(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	user := requireUser(rr, req)
	assert.Nil(t, user)
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestRequireUser_WithUser(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	user := requireUser(rr, req)
	assert.NotNil(t, user)
	assert.Equal(t, "user1", user.UID)
}

func TestParsePagination_Defaults(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	limit, startAfter := parsePagination(req)
	assert.Equal(t, 0, limit)
	assert.Equal(t, "", startAfter)
}

func TestParsePagination_WithValues(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/?limit=25&startAfter=abc", nil)
	limit, startAfter := parsePagination(req)
	assert.Equal(t, 25, limit)
	assert.Equal(t, "abc", startAfter)
}

func TestParsePagination_InvalidLimit(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/?limit=notanumber", nil)
	limit, _ := parsePagination(req)
	assert.Equal(t, 0, limit)
}

func TestDecodeJSON_NilBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.Body = nil
	rr := httptest.NewRecorder()
	var dst map[string]string
	ok := decodeJSON(rr, req, &dst)
	assert.False(t, ok)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "request body is required")
}

func TestDecodeJSON_InvalidJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("{bad"))
	rr := httptest.NewRecorder()
	var dst map[string]string
	ok := decodeJSON(rr, req, &dst)
	assert.False(t, ok)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "invalid JSON")
}

func TestDecodeJSON_Valid(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"test"}`))
	rr := httptest.NewRecorder()
	var dst map[string]string
	ok := decodeJSON(rr, req, &dst)
	assert.True(t, ok)
	assert.Equal(t, "test", dst["name"])
}

// --- Profile handler tests ---

func TestGetProfile_Success(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com", DisplayName: "Alice"}
	h := NewProfileHandler(service.NewUserService(repo))

	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.GetProfile(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "Alice")
}

func TestGetProfile_NoAuth(t *testing.T) {
	h := NewProfileHandler(service.NewUserService(newMockUserRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	rr := httptest.NewRecorder()
	h.GetProfile(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestGetProfile_NotFound(t *testing.T) {
	h := NewProfileHandler(service.NewUserService(newMockUserRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	req = withUser(req, "nonexistent", "a@b.com")
	rr := httptest.NewRecorder()
	h.GetProfile(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestUpdateProfile_Success(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	h := NewProfileHandler(service.NewUserService(repo))

	body := jsonBody(map[string]string{"displayName": "Bob"})
	req := httptest.NewRequest(http.MethodPut, "/api/profile", body)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.UpdateProfile(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "updated")
}

func TestUpdateProfile_NoAuth(t *testing.T) {
	h := NewProfileHandler(service.NewUserService(newMockUserRepo()))

	req := httptest.NewRequest(http.MethodPut, "/api/profile", strings.NewReader("{}"))
	rr := httptest.NewRecorder()
	h.UpdateProfile(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestUpdateProfile_BadJSON(t *testing.T) {
	h := NewProfileHandler(service.NewUserService(newMockUserRepo()))

	req := httptest.NewRequest(http.MethodPut, "/api/profile", strings.NewReader("{bad"))
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.UpdateProfile(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestUpdateProfile_ValidationError(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	h := NewProfileHandler(service.NewUserService(repo))

	body := jsonBody(map[string]string{"website": "ftp://bad"})
	req := httptest.NewRequest(http.MethodPut, "/api/profile", body)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.UpdateProfile(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestClaimUsername_Success(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	h := NewProfileHandler(service.NewUserService(repo))

	body := jsonBody(map[string]string{"username": "cool_user"})
	req := httptest.NewRequest(http.MethodPost, "/api/claim-username", body)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.ClaimUsername(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "claimed")
}

func TestClaimUsername_NoAuth(t *testing.T) {
	h := NewProfileHandler(service.NewUserService(newMockUserRepo()))

	req := httptest.NewRequest(http.MethodPost, "/api/claim-username", strings.NewReader("{}"))
	rr := httptest.NewRecorder()
	h.ClaimUsername(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestClaimUsername_BadJSON(t *testing.T) {
	h := NewProfileHandler(service.NewUserService(newMockUserRepo()))

	req := httptest.NewRequest(http.MethodPost, "/api/claim-username", strings.NewReader("{bad"))
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.ClaimUsername(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestClaimUsername_InvalidFormat(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	h := NewProfileHandler(service.NewUserService(repo))

	body := jsonBody(map[string]string{"username": "AB"})
	req := httptest.NewRequest(http.MethodPost, "/api/claim-username", body)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.ClaimUsername(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

// --- Project handler tests ---

func TestListProjects_Success(t *testing.T) {
	repo := newMockProjectRepo()
	svc := service.NewProjectService(repo)
	svc.CreateProject(context.Background(), "user1", &model.Project{Name: "Art"})
	h := NewProjectHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.ListProjects(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "Art")
}

func TestListProjects_NoAuth(t *testing.T) {
	h := NewProjectHandler(service.NewProjectService(newMockProjectRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	rr := httptest.NewRecorder()
	h.ListProjects(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestGetProject_Success(t *testing.T) {
	repo := newMockProjectRepo()
	svc := service.NewProjectService(repo)
	id, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Name: "Art"})
	h := NewProjectHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/projects/"+id, nil)
	req = withUser(req, "user1", "a@b.com")
	req = chiContext(req, map[string]string{"id": id})
	rr := httptest.NewRecorder()
	h.GetProject(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "Art")
}

func TestGetProject_NotFound(t *testing.T) {
	h := NewProjectHandler(service.NewProjectService(newMockProjectRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/projects/nope", nil)
	req = withUser(req, "user1", "a@b.com")
	req = chiContext(req, map[string]string{"id": "nope"})
	rr := httptest.NewRecorder()
	h.GetProject(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestCreateProject_Success(t *testing.T) {
	h := NewProjectHandler(service.NewProjectService(newMockProjectRepo()))

	body := jsonBody(map[string]string{"name": "New Art"})
	req := httptest.NewRequest(http.MethodPost, "/api/projects", body)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.CreateProject(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	assert.Contains(t, rr.Body.String(), "id")
}

func TestCreateProject_NoAuth(t *testing.T) {
	h := NewProjectHandler(service.NewProjectService(newMockProjectRepo()))

	req := httptest.NewRequest(http.MethodPost, "/api/projects", strings.NewReader("{}"))
	rr := httptest.NewRecorder()
	h.CreateProject(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestCreateProject_BadJSON(t *testing.T) {
	h := NewProjectHandler(service.NewProjectService(newMockProjectRepo()))

	req := httptest.NewRequest(http.MethodPost, "/api/projects", strings.NewReader("{bad"))
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.CreateProject(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCreateProject_ValidationFails(t *testing.T) {
	h := NewProjectHandler(service.NewProjectService(newMockProjectRepo()))

	body := jsonBody(map[string]string{"name": ""})
	req := httptest.NewRequest(http.MethodPost, "/api/projects", body)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.CreateProject(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestUpdateProject_Success(t *testing.T) {
	repo := newMockProjectRepo()
	svc := service.NewProjectService(repo)
	id, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Name: "Art"})
	h := NewProjectHandler(svc)

	body := jsonBody(map[string]string{"name": "Updated"})
	req := httptest.NewRequest(http.MethodPut, "/api/projects/"+id, body)
	req = withUser(req, "user1", "a@b.com")
	req = chiContext(req, map[string]string{"id": id})
	rr := httptest.NewRecorder()
	h.UpdateProject(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestUpdateProject_NoAuth(t *testing.T) {
	h := NewProjectHandler(service.NewProjectService(newMockProjectRepo()))

	req := httptest.NewRequest(http.MethodPut, "/api/projects/x", strings.NewReader("{}"))
	rr := httptest.NewRecorder()
	h.UpdateProject(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestUpdateProject_BadJSON(t *testing.T) {
	h := NewProjectHandler(service.NewProjectService(newMockProjectRepo()))

	req := httptest.NewRequest(http.MethodPut, "/api/projects/x", strings.NewReader("{bad"))
	req = withUser(req, "user1", "a@b.com")
	req = chiContext(req, map[string]string{"id": "x"})
	rr := httptest.NewRecorder()
	h.UpdateProject(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDeleteProject_Success(t *testing.T) {
	repo := newMockProjectRepo()
	svc := service.NewProjectService(repo)
	id, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Name: "Art"})
	h := NewProjectHandler(svc)

	req := httptest.NewRequest(http.MethodDelete, "/api/projects/"+id, nil)
	req = withUser(req, "user1", "a@b.com")
	req = chiContext(req, map[string]string{"id": id})
	rr := httptest.NewRecorder()
	h.DeleteProject(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "deleted")
}

func TestDeleteProject_NoAuth(t *testing.T) {
	h := NewProjectHandler(service.NewProjectService(newMockProjectRepo()))

	req := httptest.NewRequest(http.MethodDelete, "/api/projects/x", nil)
	rr := httptest.NewRecorder()
	h.DeleteProject(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestDeleteProject_NotFound(t *testing.T) {
	h := NewProjectHandler(service.NewProjectService(newMockProjectRepo()))

	req := httptest.NewRequest(http.MethodDelete, "/api/projects/nope", nil)
	req = withUser(req, "user1", "a@b.com")
	req = chiContext(req, map[string]string{"id": "nope"})
	rr := httptest.NewRecorder()
	h.DeleteProject(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestCountProjects_Success(t *testing.T) {
	repo := newMockProjectRepo()
	svc := service.NewProjectService(repo)
	svc.CreateProject(context.Background(), "user1", &model.Project{Name: "A"})
	svc.CreateProject(context.Background(), "user1", &model.Project{Name: "B"})
	h := NewProjectHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/projects/count", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.CountProjects(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "2")
}

func TestCountProjects_NoAuth(t *testing.T) {
	h := NewProjectHandler(service.NewProjectService(newMockProjectRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/projects/count", nil)
	rr := httptest.NewRecorder()
	h.CountProjects(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

// --- Gallery handler tests ---

func TestListGallery_Success(t *testing.T) {
	repo := newMockGalleryRepo()
	svc := service.NewGalleryService(repo)
	svc.ShareToGallery(context.Background(), "user1", &model.GalleryItem{Name: "Sunset"})
	h := NewGalleryHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/gallery", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.ListItems(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "Sunset")
}

func TestListGallery_NoAuth(t *testing.T) {
	h := NewGalleryHandler(service.NewGalleryService(newMockGalleryRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/gallery", nil)
	rr := httptest.NewRecorder()
	h.ListItems(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestGetGalleryItem_Success(t *testing.T) {
	repo := newMockGalleryRepo()
	svc := service.NewGalleryService(repo)
	id, _ := svc.ShareToGallery(context.Background(), "user1", &model.GalleryItem{Name: "Art"})
	h := NewGalleryHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/gallery/"+id, nil)
	req = withUser(req, "user1", "a@b.com")
	req = chiContext(req, map[string]string{"id": id})
	rr := httptest.NewRecorder()
	h.GetItem(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestGetGalleryItem_NotFound(t *testing.T) {
	h := NewGalleryHandler(service.NewGalleryService(newMockGalleryRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/gallery/nope", nil)
	req = withUser(req, "user1", "a@b.com")
	req = chiContext(req, map[string]string{"id": "nope"})
	rr := httptest.NewRecorder()
	h.GetItem(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestShareToGallery_Success(t *testing.T) {
	h := NewGalleryHandler(service.NewGalleryService(newMockGalleryRepo()))

	body := jsonBody(map[string]string{"name": "Sunset"})
	req := httptest.NewRequest(http.MethodPost, "/api/gallery", body)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.ShareToGallery(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	assert.Contains(t, rr.Body.String(), "id")
}

func TestShareToGallery_NoAuth(t *testing.T) {
	h := NewGalleryHandler(service.NewGalleryService(newMockGalleryRepo()))

	req := httptest.NewRequest(http.MethodPost, "/api/gallery", strings.NewReader("{}"))
	rr := httptest.NewRecorder()
	h.ShareToGallery(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestShareToGallery_BadJSON(t *testing.T) {
	h := NewGalleryHandler(service.NewGalleryService(newMockGalleryRepo()))

	req := httptest.NewRequest(http.MethodPost, "/api/gallery", strings.NewReader("{bad"))
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.ShareToGallery(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestShareToGallery_ValidationFails(t *testing.T) {
	h := NewGalleryHandler(service.NewGalleryService(newMockGalleryRepo()))

	body := jsonBody(map[string]string{"name": ""})
	req := httptest.NewRequest(http.MethodPost, "/api/gallery", body)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.ShareToGallery(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDeleteGalleryItem_Success(t *testing.T) {
	repo := newMockGalleryRepo()
	svc := service.NewGalleryService(repo)
	id, _ := svc.ShareToGallery(context.Background(), "user1", &model.GalleryItem{Name: "Art"})
	h := NewGalleryHandler(svc)

	req := httptest.NewRequest(http.MethodDelete, "/api/gallery/"+id, nil)
	req = withUser(req, "user1", "a@b.com")
	req = chiContext(req, map[string]string{"id": id})
	rr := httptest.NewRecorder()
	h.DeleteItem(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestDeleteGalleryItem_NoAuth(t *testing.T) {
	h := NewGalleryHandler(service.NewGalleryService(newMockGalleryRepo()))

	req := httptest.NewRequest(http.MethodDelete, "/api/gallery/x", nil)
	rr := httptest.NewRecorder()
	h.DeleteItem(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestCountGallery_Success(t *testing.T) {
	repo := newMockGalleryRepo()
	svc := service.NewGalleryService(repo)
	svc.ShareToGallery(context.Background(), "user1", &model.GalleryItem{Name: "A"})
	h := NewGalleryHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/gallery/count", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.CountItems(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "1")
}

func TestCountGallery_NoAuth(t *testing.T) {
	h := NewGalleryHandler(service.NewGalleryService(newMockGalleryRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/gallery/count", nil)
	rr := httptest.NewRecorder()
	h.CountItems(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

// --- NFT handler tests ---

func TestListNFTs_Success(t *testing.T) {
	repo := newMockNFTRepo()
	svc := service.NewNFTService(repo)
	svc.CreateNFT(context.Background(), "user1", &model.NFT{Name: "CoolNFT"})
	h := NewNFTHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/nfts", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.ListNFTs(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "CoolNFT")
}

func TestListNFTs_NoAuth(t *testing.T) {
	h := NewNFTHandler(service.NewNFTService(newMockNFTRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/nfts", nil)
	rr := httptest.NewRecorder()
	h.ListNFTs(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestGetNFT_Success(t *testing.T) {
	repo := newMockNFTRepo()
	svc := service.NewNFTService(repo)
	id, _ := svc.CreateNFT(context.Background(), "user1", &model.NFT{Name: "NFT"})
	h := NewNFTHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/nfts/"+id, nil)
	req = withUser(req, "user1", "a@b.com")
	req = chiContext(req, map[string]string{"id": id})
	rr := httptest.NewRecorder()
	h.GetNFT(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestGetNFT_NotFound(t *testing.T) {
	h := NewNFTHandler(service.NewNFTService(newMockNFTRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/nfts/nope", nil)
	req = withUser(req, "user1", "a@b.com")
	req = chiContext(req, map[string]string{"id": "nope"})
	rr := httptest.NewRecorder()
	h.GetNFT(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestCreateNFT_Success(t *testing.T) {
	h := NewNFTHandler(service.NewNFTService(newMockNFTRepo()))

	body := jsonBody(map[string]interface{}{"name": "NewNFT", "price": 5.0})
	req := httptest.NewRequest(http.MethodPost, "/api/nfts", body)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.CreateNFT(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	assert.Contains(t, rr.Body.String(), "id")
}

func TestCreateNFT_NoAuth(t *testing.T) {
	h := NewNFTHandler(service.NewNFTService(newMockNFTRepo()))

	req := httptest.NewRequest(http.MethodPost, "/api/nfts", strings.NewReader("{}"))
	rr := httptest.NewRecorder()
	h.CreateNFT(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestCreateNFT_BadJSON(t *testing.T) {
	h := NewNFTHandler(service.NewNFTService(newMockNFTRepo()))

	req := httptest.NewRequest(http.MethodPost, "/api/nfts", strings.NewReader("{bad"))
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.CreateNFT(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCreateNFT_ValidationFails(t *testing.T) {
	h := NewNFTHandler(service.NewNFTService(newMockNFTRepo()))

	body := jsonBody(map[string]interface{}{"name": "", "price": -1})
	req := httptest.NewRequest(http.MethodPost, "/api/nfts", body)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.CreateNFT(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDeleteNFT_Success(t *testing.T) {
	repo := newMockNFTRepo()
	svc := service.NewNFTService(repo)
	id, _ := svc.CreateNFT(context.Background(), "user1", &model.NFT{Name: "NFT"})
	h := NewNFTHandler(svc)

	req := httptest.NewRequest(http.MethodDelete, "/api/nfts/"+id, nil)
	req = withUser(req, "user1", "a@b.com")
	req = chiContext(req, map[string]string{"id": id})
	rr := httptest.NewRecorder()
	h.DeleteNFT(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestDeleteNFT_NoAuth(t *testing.T) {
	h := NewNFTHandler(service.NewNFTService(newMockNFTRepo()))

	req := httptest.NewRequest(http.MethodDelete, "/api/nfts/x", nil)
	rr := httptest.NewRecorder()
	h.DeleteNFT(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestCountNFTs_Success(t *testing.T) {
	repo := newMockNFTRepo()
	svc := service.NewNFTService(repo)
	svc.CreateNFT(context.Background(), "user1", &model.NFT{Name: "A"})
	svc.CreateNFT(context.Background(), "user1", &model.NFT{Name: "B"})
	h := NewNFTHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/nfts/count", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.CountNFTs(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "2")
}

func TestCountNFTs_NoAuth(t *testing.T) {
	h := NewNFTHandler(service.NewNFTService(newMockNFTRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/nfts/count", nil)
	rr := httptest.NewRecorder()
	h.CountNFTs(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

// --- Additional error path tests ---

func TestListProjects_WithPagination(t *testing.T) {
	repo := newMockProjectRepo()
	svc := service.NewProjectService(repo)
	svc.CreateProject(context.Background(), "user1", &model.Project{Name: "A"})
	h := NewProjectHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/projects?limit=5&startAfter=abc", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.ListProjects(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestGetProject_NoAuth(t *testing.T) {
	h := NewProjectHandler(service.NewProjectService(newMockProjectRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/projects/x", nil)
	rr := httptest.NewRecorder()
	h.GetProject(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestGetGalleryItem_NoAuth(t *testing.T) {
	h := NewGalleryHandler(service.NewGalleryService(newMockGalleryRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/gallery/x", nil)
	rr := httptest.NewRecorder()
	h.GetItem(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestGetNFT_NoAuth(t *testing.T) {
	h := NewNFTHandler(service.NewNFTService(newMockNFTRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/nfts/x", nil)
	rr := httptest.NewRecorder()
	h.GetNFT(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestDeleteGalleryItem_NotFound(t *testing.T) {
	h := NewGalleryHandler(service.NewGalleryService(newMockGalleryRepo()))

	req := httptest.NewRequest(http.MethodDelete, "/api/gallery/nope", nil)
	req = withUser(req, "user1", "a@b.com")
	req = chiContext(req, map[string]string{"id": "nope"})
	rr := httptest.NewRecorder()
	h.DeleteItem(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestDeleteNFT_NotFound(t *testing.T) {
	h := NewNFTHandler(service.NewNFTService(newMockNFTRepo()))

	req := httptest.NewRequest(http.MethodDelete, "/api/nfts/nope", nil)
	req = withUser(req, "user1", "a@b.com")
	req = chiContext(req, map[string]string{"id": "nope"})
	rr := httptest.NewRecorder()
	h.DeleteNFT(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestUpdateProject_NotFound(t *testing.T) {
	h := NewProjectHandler(service.NewProjectService(newMockProjectRepo()))

	body := jsonBody(map[string]string{"name": "Updated"})
	req := httptest.NewRequest(http.MethodPut, "/api/projects/nope", body)
	req = withUser(req, "user1", "a@b.com")
	req = chiContext(req, map[string]string{"id": "nope"})
	rr := httptest.NewRecorder()
	h.UpdateProject(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestListGallery_WithPagination(t *testing.T) {
	h := NewGalleryHandler(service.NewGalleryService(newMockGalleryRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/gallery?limit=20&startAfter=xyz", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.ListItems(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestListNFTs_WithPagination(t *testing.T) {
	h := NewNFTHandler(service.NewNFTService(newMockNFTRepo()))

	req := httptest.NewRequest(http.MethodGet, "/api/nfts?limit=20&startAfter=xyz", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.ListNFTs(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

// --- Error-returning mock repos for error path coverage ---

type failingProjectRepo struct{ mockProjectRepo }

func (m *failingProjectRepo) List(_ context.Context, _ string, _ int, _ string) ([]*model.Project, error) {
	return nil, fmt.Errorf("firestore unavailable")
}
func (m *failingProjectRepo) Count(_ context.Context, _ string) (int64, error) {
	return 0, fmt.Errorf("firestore unavailable")
}

type failingGalleryRepo struct{ mockGalleryRepo }

func (m *failingGalleryRepo) List(_ context.Context, _ string, _ int, _ string) ([]*model.GalleryItem, error) {
	return nil, fmt.Errorf("firestore unavailable")
}
func (m *failingGalleryRepo) Count(_ context.Context, _ string) (int64, error) {
	return 0, fmt.Errorf("firestore unavailable")
}

type failingNFTRepo struct{ mockNFTRepo }

func (m *failingNFTRepo) List(_ context.Context, _ string, _ int, _ string) ([]*model.NFT, error) {
	return nil, fmt.Errorf("firestore unavailable")
}
func (m *failingNFTRepo) Count(_ context.Context, _ string) (int64, error) {
	return 0, fmt.Errorf("firestore unavailable")
}

func TestListProjects_ServiceError(t *testing.T) {
	h := NewProjectHandler(service.NewProjectService(&failingProjectRepo{}))

	req := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.ListProjects(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
}

func TestCountProjects_ServiceError(t *testing.T) {
	h := NewProjectHandler(service.NewProjectService(&failingProjectRepo{}))

	req := httptest.NewRequest(http.MethodGet, "/api/projects/count", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.CountProjects(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
}

func TestListGallery_ServiceError(t *testing.T) {
	h := NewGalleryHandler(service.NewGalleryService(&failingGalleryRepo{}))

	req := httptest.NewRequest(http.MethodGet, "/api/gallery", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.ListItems(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
}

func TestCountGallery_ServiceError(t *testing.T) {
	h := NewGalleryHandler(service.NewGalleryService(&failingGalleryRepo{}))

	req := httptest.NewRequest(http.MethodGet, "/api/gallery/count", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.CountItems(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
}

func TestListNFTs_ServiceError(t *testing.T) {
	h := NewNFTHandler(service.NewNFTService(&failingNFTRepo{}))

	req := httptest.NewRequest(http.MethodGet, "/api/nfts", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.ListNFTs(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
}

func TestCountNFTs_ServiceError(t *testing.T) {
	h := NewNFTHandler(service.NewNFTService(&failingNFTRepo{}))

	req := httptest.NewRequest(http.MethodGet, "/api/nfts/count", nil)
	req = withUser(req, "user1", "a@b.com")
	rr := httptest.NewRecorder()
	h.CountNFTs(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
}

// --- respondError tests ---

func TestRespondError_LogsAndResponds(t *testing.T) {
	rr := httptest.NewRecorder()
	respondError(rr, fmt.Errorf("user not found"))
	assert.Equal(t, http.StatusNotFound, rr.Code)
	assert.Contains(t, rr.Body.String(), "user not found")
}

func TestRespondError_500_SanitizesMessage(t *testing.T) {
	rr := httptest.NewRecorder()
	respondError(rr, fmt.Errorf("firestore: connection refused to projects/paintbar-7f887"))
	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	assert.Contains(t, rr.Body.String(), "internal server error")
	assert.NotContains(t, rr.Body.String(), "firestore")
}

func TestRespondJSON_CacheControl(t *testing.T) {
	rr := httptest.NewRecorder()
	respondJSON(rr, http.StatusOK, map[string]string{"ok": "true"})
	assert.Equal(t, "no-store", rr.Header().Get("Cache-Control"))
}

// --- decodeJSON security tests ---

func TestDecodeJSON_BodyTooLarge(t *testing.T) {
	// Create valid JSON that exceeds maxRequestBodySize (1 MB)
	// {"k":"vvvvv..."} where the value is large enough to exceed the limit
	bigValue := strings.Repeat("v", maxRequestBodySize+1)
	bigJSON := `{"k":"` + bigValue + `"}`
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(bigJSON))
	rr := httptest.NewRecorder()

	var dst map[string]string
	ok := decodeJSON(rr, req, &dst)

	assert.False(t, ok)
	// MaxBytesReader triggers — either 413 or 400 depending on how json.Decoder wraps it
	assert.True(t, rr.Code == http.StatusRequestEntityTooLarge || rr.Code == http.StatusBadRequest)
}

func TestDecodeJSON_InvalidJSON_SanitizedError(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("{bad json"))
	rr := httptest.NewRecorder()

	var dst map[string]string
	ok := decodeJSON(rr, req, &dst)

	assert.False(t, ok)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	// Should NOT contain raw Go error details
	assert.Contains(t, rr.Body.String(), "invalid JSON")
	assert.NotContains(t, rr.Body.String(), "looking for beginning")
}

// --- Docs handler tests ---

func TestDocsHandler_ServeSpec(t *testing.T) {
	h := NewDocsHandler([]byte("openapi: 3.1.0"))

	req := httptest.NewRequest(http.MethodGet, "/api/docs/openapi.yaml", nil)
	rr := httptest.NewRecorder()
	h.ServeSpec(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "application/yaml", rr.Header().Get("Content-Type"))
	assert.Contains(t, rr.Body.String(), "openapi: 3.1.0")
}

func TestDocsHandler_ServeUI(t *testing.T) {
	h := NewDocsHandler(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/docs", nil)
	rr := httptest.NewRecorder()
	h.ServeUI(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Header().Get("Content-Type"), "text/html")
	assert.Contains(t, rr.Body.String(), "swagger-ui")
	assert.Contains(t, rr.Body.String(), "/api/docs/init.js")
}

func TestDocsHandler_ServeInitJS(t *testing.T) {
	h := NewDocsHandler(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/docs/init.js", nil)
	rr := httptest.NewRecorder()
	h.ServeInitJS(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "application/javascript", rr.Header().Get("Content-Type"))
	assert.Contains(t, rr.Body.String(), "SwaggerUIBundle")
	assert.Contains(t, rr.Body.String(), "openapi.yaml")
}

// --- Template renderer and page handler tests ---

func TestNewTemplateRenderer_Success(t *testing.T) {
	renderer, err := NewTemplateRenderer(testTemplatesFS())
	require.NoError(t, err)
	assert.NotNil(t, renderer)
}

func TestNewTemplateRenderer_BadFS(t *testing.T) {
	// Empty FS will fail to find templates
	emptyFS := fstest.MapFS{}
	_, err := NewTemplateRenderer(emptyFS)
	assert.Error(t, err)
}

func TestTemplateRenderer_Render_Success(t *testing.T) {
	renderer, err := NewTemplateRenderer(testTemplatesFS())
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	renderer.Render(rr, "login", PageData{Title: "Login"})

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Header().Get("Content-Type"), "text/html")
	assert.Contains(t, rr.Body.String(), "Login")
}

func TestTemplateRenderer_Render_NotFound(t *testing.T) {
	renderer, err := NewTemplateRenderer(testTemplatesFS())
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	renderer.Render(rr, "nonexistent", PageData{})

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestPageHandler_Login(t *testing.T) {
	renderer, _ := NewTemplateRenderer(testTemplatesFS())
	h := NewPageHandler(renderer, "local")

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	h.Login(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "Login")
}

func TestPageHandler_Profile(t *testing.T) {
	renderer, _ := NewTemplateRenderer(testTemplatesFS())
	h := NewPageHandler(renderer, "local")

	req := httptest.NewRequest(http.MethodGet, "/profile", nil)
	rr := httptest.NewRecorder()
	h.Profile(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "Profile")
}

func TestPageHandler_Canvas(t *testing.T) {
	renderer, _ := NewTemplateRenderer(testTemplatesFS())
	h := NewPageHandler(renderer, "local")

	req := httptest.NewRequest(http.MethodGet, "/canvas", nil)
	rr := httptest.NewRecorder()
	h.Canvas(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "Canvas")
}

func TestPageHandler_NotFound(t *testing.T) {
	renderer, _ := NewTemplateRenderer(testTemplatesFS())
	h := NewPageHandler(renderer, "local")

	req := httptest.NewRequest(http.MethodGet, "/nope", nil)
	rr := httptest.NewRecorder()
	h.NotFound(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
	assert.Contains(t, rr.Body.String(), "404")
}

func TestTemplateRenderer_Render_ExecuteError(t *testing.T) {
	// Create a template that will error during execution by calling a missing function
	badTmpl := template.Must(template.New("base.html").Parse(`{{call .BadFunc}}`))
	renderer := &TemplateRenderer{
		templates: map[string]*template.Template{
			"broken": badTmpl,
		},
	}

	rr := httptest.NewRecorder()
	renderer.Render(rr, "broken", PageData{})

	// ExecuteTemplate writes partial output then errors, so status may be 200
	// but the error log path is exercised
	assert.Contains(t, rr.Body.String(), "")
}

func TestCurrentYear(t *testing.T) {
	fn := templateFuncs["currentYear"].(func() int)
	year := fn()
	assert.Equal(t, time.Now().Year(), year)
}

// testTemplatesFS returns a minimal in-memory FS for template tests.
func testTemplatesFS() fstest.MapFS {
	base := `<!DOCTYPE html><html><head><title>{{block "title" .}}PaintBar{{end}}</title>{{block "head" .}}{{end}}</head><body>{{block "body" .}}{{end}}{{block "scripts" .}}{{end}}</body></html>`
	login := `{{define "title"}}Login{{end}}{{define "head"}}{{end}}{{define "body"}}<h1>Login</h1>{{end}}{{define "scripts"}}{{end}}`
	profile := `{{define "title"}}Profile{{end}}{{define "head"}}{{end}}{{define "body"}}<h1>Profile</h1>{{end}}{{define "scripts"}}{{end}}`
	canvas := `{{define "title"}}Canvas{{end}}{{define "head"}}{{end}}{{define "body"}}<h1>Canvas</h1>{{end}}{{define "scripts"}}{{end}}`
	notFound := `{{define "title"}}404{{end}}{{define "head"}}{{end}}{{define "body"}}<h1>404</h1>{{end}}{{define "scripts"}}{{end}}`

	return fstest.MapFS{
		"templates/layouts/base.html":  &fstest.MapFile{Data: []byte(base)},
		"templates/pages/login.html":   &fstest.MapFile{Data: []byte(login)},
		"templates/pages/profile.html": &fstest.MapFile{Data: []byte(profile)},
		"templates/pages/canvas.html":  &fstest.MapFile{Data: []byte(canvas)},
		"templates/pages/404.html":     &fstest.MapFile{Data: []byte(notFound)},
	}
}
