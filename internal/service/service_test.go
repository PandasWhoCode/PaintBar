package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"testing"
	"time"

	"github.com/pandasWhoCode/paintbar/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- UserService tests ---

func TestUserService_GetProfile(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com", DisplayName: "Alice"}
	svc := NewUserService(repo)

	user, err := svc.GetProfile(context.Background(), "user1")
	require.NoError(t, err)
	assert.Equal(t, "Alice", user.DisplayName)
}

func TestUserService_GetProfile_NotFound(t *testing.T) {
	svc := NewUserService(newMockUserRepo())
	_, err := svc.GetProfile(context.Background(), "nonexistent")
	assert.Error(t, err)
}

func TestUserService_GetProfile_EmptyUID(t *testing.T) {
	svc := NewUserService(newMockUserRepo())
	_, err := svc.GetProfile(context.Background(), "")
	assert.ErrorContains(t, err, "uid is required")
}

func TestUserService_UpdateProfile(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	svc := NewUserService(repo)

	name := "  Alice  "
	update := &model.UserUpdate{DisplayName: &name}
	err := svc.UpdateProfile(context.Background(), "user1", "user1", update)
	require.NoError(t, err)
	assert.Equal(t, "Alice", *update.DisplayName) // should be trimmed
}

func TestUserService_UpdateProfile_Unauthorized(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	svc := NewUserService(repo)

	name := "Hacker"
	update := &model.UserUpdate{DisplayName: &name}
	err := svc.UpdateProfile(context.Background(), "attacker", "user1", update)
	assert.ErrorContains(t, err, "unauthorized")
}

func TestUserService_UpdateProfile_BadURL(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	svc := NewUserService(repo)

	badURL := "ftp://bad.com"
	update := &model.UserUpdate{Website: &badURL}
	err := svc.UpdateProfile(context.Background(), "user1", "user1", update)
	assert.Error(t, err)
}

func TestUserService_UpdateProfile_LongDisplayName(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	svc := NewUserService(repo)

	long := string(make([]byte, 101))
	update := &model.UserUpdate{DisplayName: &long}
	err := svc.UpdateProfile(context.Background(), "user1", "user1", update)
	assert.ErrorContains(t, err, "display name must be 100")
}

func TestUserService_UpdateProfile_NormalizesHandles(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	svc := NewUserService(repo)

	handle := "@alice"
	update := &model.UserUpdate{TwitterHandle: &handle}
	err := svc.UpdateProfile(context.Background(), "user1", "user1", update)
	require.NoError(t, err)
	assert.Equal(t, "alice", *update.TwitterHandle)
}

func TestUserService_ClaimUsername(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com", Username: ""}
	svc := NewUserService(repo)

	err := svc.ClaimUsername(context.Background(), "user1", "cool_user")
	require.NoError(t, err)
}

func TestUserService_ClaimUsername_InvalidFormat(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	svc := NewUserService(repo)

	err := svc.ClaimUsername(context.Background(), "user1", "AB")
	assert.ErrorContains(t, err, "username must be")
}

func TestUserService_ClaimUsername_AlreadySet(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com", Username: "existing"}
	svc := NewUserService(repo)

	err := svc.ClaimUsername(context.Background(), "user1", "new_name")
	assert.ErrorContains(t, err, "username already set")
}

func TestUserService_ClaimUsername_EmptyUID(t *testing.T) {
	svc := NewUserService(newMockUserRepo())
	err := svc.ClaimUsername(context.Background(), "", "cool_user")
	assert.ErrorContains(t, err, "uid is required")
}

func TestUserService_ClaimUsername_UserNotFound(t *testing.T) {
	svc := NewUserService(newMockUserRepo())
	err := svc.ClaimUsername(context.Background(), "nonexistent", "cool_user")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "get user for username claim")
}

func TestUserService_UpdateProfile_BadGithubURL(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	svc := NewUserService(repo)

	badURL := "ftp://github.com"
	update := &model.UserUpdate{GithubURL: &badURL}
	err := svc.UpdateProfile(context.Background(), "user1", "user1", update)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "github URL")
}

func TestUserService_UpdateProfile_LongBio(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	svc := NewUserService(repo)

	long := string(make([]byte, 501))
	update := &model.UserUpdate{Bio: &long}
	err := svc.UpdateProfile(context.Background(), "user1", "user1", update)
	assert.ErrorContains(t, err, "bio must be 500")
}

func TestUserService_UpdateProfile_LongLocation(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	svc := NewUserService(repo)

	long := string(make([]byte, 101))
	update := &model.UserUpdate{Location: &long}
	err := svc.UpdateProfile(context.Background(), "user1", "user1", update)
	assert.ErrorContains(t, err, "location must be 100")
}

func TestUserService_UpdateProfile_EmptyWebsite_OK(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	svc := NewUserService(repo)

	empty := ""
	update := &model.UserUpdate{Website: &empty}
	err := svc.UpdateProfile(context.Background(), "user1", "user1", update)
	assert.NoError(t, err)
}

func TestUserService_UpdateProfile_EmptyGithubURL_OK(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	svc := NewUserService(repo)

	empty := ""
	update := &model.UserUpdate{GithubURL: &empty}
	err := svc.UpdateProfile(context.Background(), "user1", "user1", update)
	assert.NoError(t, err)
}

func TestUserService_UpdateProfile_AllHandlesNormalized(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	svc := NewUserService(repo)

	bs := "  @alice.bsky  "
	ig := "  @alice_ig  "
	hbar := "  0.0.123  "
	update := &model.UserUpdate{
		BlueskyHandle:   &bs,
		InstagramHandle: &ig,
		HbarAddress:     &hbar,
	}
	err := svc.UpdateProfile(context.Background(), "user1", "user1", update)
	require.NoError(t, err)
	assert.Equal(t, "alice.bsky", *update.BlueskyHandle)
	assert.Equal(t, "alice_ig", *update.InstagramHandle)
	assert.Equal(t, "0.0.123", *update.HbarAddress)
}

func TestUserService_ClaimUsername_Taken(t *testing.T) {
	repo := newMockUserRepo()
	repo.users["user1"] = &model.User{UID: "user1", Email: "a@b.com"}
	repo.users["user2"] = &model.User{UID: "user2", Email: "b@b.com"}
	repo.usernames["cool_user"] = "user2"
	svc := NewUserService(repo)

	err := svc.ClaimUsername(context.Background(), "user1", "cool_user")
	assert.ErrorContains(t, err, "already taken")
}

// --- ProjectService tests ---

func TestProjectService_CreateAndGet(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo, nil)

	project := &model.Project{Title: "My Art", IsPublic: false}
	result, err := svc.CreateProject(context.Background(), "user1", project)
	require.NoError(t, err)
	assert.NotEmpty(t, result.ProjectID)

	got, err := svc.GetProject(context.Background(), "user1", result.ProjectID)
	require.NoError(t, err)
	assert.Equal(t, "My Art", got.Title)
	assert.Equal(t, "user1", got.UserID)
}

func TestProjectService_GetProject_Unauthorized(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo, nil)

	project := &model.Project{Title: "Private Art", IsPublic: false}
	result, _ := svc.CreateProject(context.Background(), "user1", project)

	_, err := svc.GetProject(context.Background(), "attacker", result.ProjectID)
	assert.ErrorContains(t, err, "unauthorized")
}

func TestProjectService_GetProject_PublicAllowed(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo, nil)

	project := &model.Project{Title: "Public Art", IsPublic: true}
	result, _ := svc.CreateProject(context.Background(), "user1", project)

	got, err := svc.GetProject(context.Background(), "other_user", result.ProjectID)
	require.NoError(t, err)
	assert.Equal(t, "Public Art", got.Title)
}

func TestProjectService_UpdateProject_Unauthorized(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo, nil)

	project := &model.Project{Title: "Art"}
	result, _ := svc.CreateProject(context.Background(), "user1", project)

	title := "Hacked"
	err := svc.UpdateProject(context.Background(), "attacker", result.ProjectID, &model.ProjectUpdate{Title: &title})
	assert.ErrorContains(t, err, "unauthorized")
}

func TestProjectService_DeleteProject_Unauthorized(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo, nil)

	project := &model.Project{Title: "Art"}
	result, _ := svc.CreateProject(context.Background(), "user1", project)

	err := svc.DeleteProject(context.Background(), "attacker", result.ProjectID)
	assert.ErrorContains(t, err, "unauthorized")
}

func TestProjectService_DeleteProject_Success(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo, nil)

	project := &model.Project{Title: "Art"}
	result, _ := svc.CreateProject(context.Background(), "user1", project)

	err := svc.DeleteProject(context.Background(), "user1", result.ProjectID)
	require.NoError(t, err)

	_, err = svc.GetProject(context.Background(), "user1", result.ProjectID)
	assert.Error(t, err) // should be gone
}

func TestProjectService_ListProjects(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo, nil)

	for i := 0; i < 3; i++ {
		svc.CreateProject(context.Background(), "user1", &model.Project{Title: fmt.Sprintf("Art %d", i)})
	}
	svc.CreateProject(context.Background(), "user2", &model.Project{Title: "Other"})

	projects, err := svc.ListProjects(context.Background(), "user1", 10, "")
	require.NoError(t, err)
	assert.Len(t, projects, 3)
}

func TestProjectService_ListProjects_CapsPageSize(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo, nil)

	// Request 100 but max is 50 — service should cap it without error
	_, err := svc.ListProjects(context.Background(), "user1", 100, "")
	require.NoError(t, err)
}

func TestProjectService_CountProjects(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo, nil)

	svc.CreateProject(context.Background(), "user1", &model.Project{Title: "A"})
	svc.CreateProject(context.Background(), "user1", &model.Project{Title: "B"})

	count, err := svc.CountProjects(context.Background(), "user1")
	require.NoError(t, err)
	assert.Equal(t, int64(2), count)
}

func TestProjectService_CreateProject_ValidationFails(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), nil)
	_, err := svc.CreateProject(context.Background(), "user1", &model.Project{Title: ""})
	assert.ErrorContains(t, err, "title is required")
}

func TestProjectService_ListProjects_EmptyUID(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), nil)
	_, err := svc.ListProjects(context.Background(), "", 10, "")
	assert.ErrorContains(t, err, "uid is required")
}

func TestProjectService_ListProjects_DefaultPageSize(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo, nil)
	// limit 0 should default to DefaultPageSize
	_, err := svc.ListProjects(context.Background(), "user1", 0, "")
	require.NoError(t, err)
}

func TestProjectService_ListProjects_NegativePageSize(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), nil)
	_, err := svc.ListProjects(context.Background(), "user1", -5, "")
	require.NoError(t, err)
}

func TestProjectService_GetProject_EmptyID(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), nil)
	_, err := svc.GetProject(context.Background(), "user1", "")
	assert.ErrorContains(t, err, "project ID is required")
}

func TestProjectService_GetProject_NotFound(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), nil)
	_, err := svc.GetProject(context.Background(), "user1", "nonexistent")
	assert.Error(t, err)
}

func TestProjectService_UpdateProject_EmptyID(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), nil)
	title := "test"
	err := svc.UpdateProject(context.Background(), "user1", "", &model.ProjectUpdate{Title: &title})
	assert.ErrorContains(t, err, "project ID is required")
}

func TestProjectService_UpdateProject_NotFound(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), nil)
	title := "test"
	err := svc.UpdateProject(context.Background(), "user1", "nonexistent", &model.ProjectUpdate{Title: &title})
	assert.Error(t, err)
}

func TestProjectService_UpdateProject_Success(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo, nil)
	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art"})
	title := "Updated"
	err := svc.UpdateProject(context.Background(), "user1", result.ProjectID, &model.ProjectUpdate{Title: &title})
	assert.NoError(t, err)
}

func TestProjectService_DeleteProject_EmptyID(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), nil)
	err := svc.DeleteProject(context.Background(), "user1", "")
	assert.ErrorContains(t, err, "project ID is required")
}

func TestProjectService_DeleteProject_NotFound(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), nil)
	err := svc.DeleteProject(context.Background(), "user1", "nonexistent")
	assert.Error(t, err)
}

func TestProjectService_CountProjects_EmptyUID(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), nil)
	_, err := svc.CountProjects(context.Background(), "")
	assert.ErrorContains(t, err, "uid is required")
}

// --- Mock StorageClient for testing ---

type mockStorageClient struct {
	objects map[string]bool // tracks which object paths "exist"
}

func newMockStorageClient() *mockStorageClient {
	return &mockStorageClient{objects: make(map[string]bool)}
}

func (m *mockStorageClient) GenerateUploadURL(objectPath string, _ time.Duration) (string, error) {
	return "https://storage.example.com/upload/" + objectPath, nil
}

func (m *mockStorageClient) GenerateDownloadURL(objectPath string, _ time.Duration) (string, error) {
	return "https://storage.example.com/download/" + objectPath, nil
}

func (m *mockStorageClient) ObjectExists(_ context.Context, objectPath string) (bool, error) {
	return m.objects[objectPath], nil
}

func (m *mockStorageClient) ReadObject(_ context.Context, objectPath string) (io.ReadCloser, error) {
	if m.objects[objectPath] {
		return io.NopCloser(bytes.NewReader([]byte("fake-png-data"))), nil
	}
	return nil, fmt.Errorf("object not found: %s", objectPath)
}

func (m *mockStorageClient) WriteObject(_ context.Context, objectPath string, _ io.Reader, _ string) error {
	m.objects[objectPath] = true
	return nil
}

func (m *mockStorageClient) DeleteObject(_ context.Context, objectPath string) error {
	delete(m.objects, objectPath)
	return nil
}

// --- ProjectService + Storage tests ---

func TestProjectService_CreateProject_WithStorage(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	project := &model.Project{
		Title:       "Art",
		ContentHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
	}
	result, err := svc.CreateProject(context.Background(), "user1", project)
	require.NoError(t, err)
	assert.NotEmpty(t, result.ProjectID)
	assert.False(t, result.Duplicate)
}

func TestProjectService_CreateProject_Dedup(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	hash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	project := &model.Project{Title: "Art", ContentHash: hash}
	first, err := svc.CreateProject(context.Background(), "user1", project)
	require.NoError(t, err)

	// Same hash → should return existing project as duplicate
	project2 := &model.Project{Title: "Art Again", ContentHash: hash}
	second, err := svc.CreateProject(context.Background(), "user1", project2)
	require.NoError(t, err)
	assert.True(t, second.Duplicate)
	assert.Equal(t, first.ProjectID, second.ProjectID)
}

func TestProjectService_ConfirmUpload_Success(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	hash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	project := &model.Project{Title: "Art", ContentHash: hash}
	result, _ := svc.CreateProject(context.Background(), "user1", project)

	// Simulate the blob being uploaded
	storage.objects["projects/user1/"+hash+".png"] = true

	err := svc.ConfirmUpload(context.Background(), "user1", result.ProjectID)
	require.NoError(t, err)

	// Verify storageURL was set
	got, _ := svc.GetProject(context.Background(), "user1", result.ProjectID)
	assert.Contains(t, got.StorageURL, "download/")
}

func TestProjectService_ConfirmUpload_NotUploaded(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	hash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	project := &model.Project{Title: "Art", ContentHash: hash}
	result, _ := svc.CreateProject(context.Background(), "user1", project)

	// Don't simulate upload — should fail
	err := svc.ConfirmUpload(context.Background(), "user1", result.ProjectID)
	assert.ErrorContains(t, err, "upload not found")
}

func TestProjectService_ConfirmUpload_Unauthorized(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	hash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	project := &model.Project{Title: "Art", ContentHash: hash}
	result, _ := svc.CreateProject(context.Background(), "user1", project)

	err := svc.ConfirmUpload(context.Background(), "attacker", result.ProjectID)
	assert.ErrorContains(t, err, "unauthorized")
}

func TestProjectService_ConfirmUpload_EmptyID(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), newMockStorageClient())
	err := svc.ConfirmUpload(context.Background(), "user1", "")
	assert.ErrorContains(t, err, "project ID is required")
}

func TestProjectService_ConfirmUpload_NoStorage(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), nil)
	err := svc.ConfirmUpload(context.Background(), "user1", "proj_1")
	assert.ErrorContains(t, err, "storage is not configured")
}

func TestProjectService_ConfirmUpload_NoContentHash(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	// Create project without content hash
	project := &model.Project{Title: "Art"}
	result, _ := svc.CreateProject(context.Background(), "user1", project)

	err := svc.ConfirmUpload(context.Background(), "user1", result.ProjectID)
	assert.ErrorContains(t, err, "no content hash")
}

func TestProjectService_DeleteProject_WithStorage(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	hash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	project := &model.Project{Title: "Art", ContentHash: hash}
	result, _ := svc.CreateProject(context.Background(), "user1", project)

	// Simulate blob existing
	objPath := "projects/user1/" + hash + ".png"
	storage.objects[objPath] = true

	err := svc.DeleteProject(context.Background(), "user1", result.ProjectID)
	require.NoError(t, err)

	// Verify blob was deleted
	assert.False(t, storage.objects[objPath])
}

// --- GetProjectByTitle tests ---

func TestProjectService_GetProjectByTitle_Success(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo, nil)

	svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Sunset"})

	got, err := svc.GetProjectByTitle(context.Background(), "user1", "Sunset")
	require.NoError(t, err)
	assert.Equal(t, "Sunset", got.Title)
}

func TestProjectService_GetProjectByTitle_NotFound(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), nil)

	_, err := svc.GetProjectByTitle(context.Background(), "user1", "Nonexistent")
	assert.ErrorContains(t, err, "project not found")
}

func TestProjectService_GetProjectByTitle_EmptyTitle(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), nil)

	_, err := svc.GetProjectByTitle(context.Background(), "user1", "")
	assert.ErrorContains(t, err, "title is required")
}

// --- DownloadBlob tests ---

func TestProjectService_DownloadBlob_Success(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	hash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art", ContentHash: hash})

	objPath := "projects/user1/" + hash + ".png"
	storage.objects[objPath] = true

	reader, err := svc.DownloadBlob(context.Background(), "user1", result.ProjectID)
	require.NoError(t, err)
	defer reader.Close()
	data, _ := io.ReadAll(reader)
	assert.Equal(t, []byte("fake-png-data"), data)
}

func TestProjectService_DownloadBlob_EmptyID(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), newMockStorageClient())
	_, err := svc.DownloadBlob(context.Background(), "user1", "")
	assert.ErrorContains(t, err, "project ID is required")
}

func TestProjectService_DownloadBlob_NoStorage(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo, nil)

	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art"})

	_, err := svc.DownloadBlob(context.Background(), "user1", result.ProjectID)
	assert.ErrorContains(t, err, "storage is not configured")
}

func TestProjectService_DownloadBlob_Unauthorized(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art"})

	_, err := svc.DownloadBlob(context.Background(), "attacker", result.ProjectID)
	assert.ErrorContains(t, err, "unauthorized")
}

func TestProjectService_DownloadBlob_NoContentHash(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art"})

	_, err := svc.DownloadBlob(context.Background(), "user1", result.ProjectID)
	assert.ErrorContains(t, err, "no content hash")
}

// --- CreateProject upsert tests ---

func TestProjectService_CreateProject_UpsertByTitle(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	hash1 := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	hash2 := "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

	// Create initial project
	result1, err := svc.CreateProject(context.Background(), "user1", &model.Project{
		Title: "My Art", ContentHash: hash1, Width: 800, Height: 600,
	})
	require.NoError(t, err)
	assert.False(t, result1.Duplicate)

	// Upsert with same title, different content
	result2, err := svc.CreateProject(context.Background(), "user1", &model.Project{
		Title: "My Art", ContentHash: hash2, Width: 1024, Height: 768,
	})
	require.NoError(t, err)
	assert.Equal(t, result1.ProjectID, result2.ProjectID) // same project ID
	assert.False(t, result2.Duplicate)

	// Verify the project was updated
	got, err := svc.GetProject(context.Background(), "user1", result1.ProjectID)
	require.NoError(t, err)
	assert.Equal(t, hash2, got.ContentHash)
	assert.Equal(t, 1024, got.Width)
	assert.Equal(t, 768, got.Height)
}

func TestProjectService_CreateProject_UpsertClearsStorageURL(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	hash1 := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	hash2 := "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{
		Title: "Art", ContentHash: hash1,
	})

	// Simulate confirm-upload setting storageURL
	objPath := "projects/user1/" + hash1 + ".png"
	storage.objects[objPath] = true
	svc.ConfirmUpload(context.Background(), "user1", result.ProjectID)

	// Verify storageURL was set
	got, _ := svc.GetProject(context.Background(), "user1", result.ProjectID)
	assert.NotEmpty(t, got.StorageURL)

	// Upsert with new content — storageURL should be cleared
	svc.CreateProject(context.Background(), "user1", &model.Project{
		Title: "Art", ContentHash: hash2,
	})

	got, _ = svc.GetProject(context.Background(), "user1", result.ProjectID)
	assert.Empty(t, got.StorageURL)
	assert.Equal(t, hash2, got.ContentHash)
}

// --- Error-path tests for service coverage ---

func TestProjectService_CreateProject_DedupCheckFails(t *testing.T) {
	repo := &failingFindByContentHashRepo{mockProjectRepo: *newMockProjectRepo()}
	svc := NewProjectService(repo, nil)

	hash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	_, err := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art", ContentHash: hash})
	assert.ErrorContains(t, err, "dedup check")
}

func TestProjectService_CreateProject_TitleLookupFails(t *testing.T) {
	repo := &failingFindByTitleRepo{mockProjectRepo: *newMockProjectRepo()}
	svc := NewProjectService(repo, nil)

	_, err := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art"})
	assert.ErrorContains(t, err, "title lookup")
}

func TestProjectService_GetProjectByTitle_RepoError(t *testing.T) {
	repo := &failingFindByTitleRepo{mockProjectRepo: *newMockProjectRepo()}
	svc := NewProjectService(repo, nil)

	_, err := svc.GetProjectByTitle(context.Background(), "user1", "Art")
	assert.ErrorContains(t, err, "find project by title")
}

func TestProjectService_ConfirmUpload_ObjectExistsFails(t *testing.T) {
	repo := newMockProjectRepo()
	storage := &failingObjectExistsStorageClient{mockStorageClient: *newMockStorageClient()}
	svc := NewProjectService(repo, storage)

	hash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art", ContentHash: hash})

	err := svc.ConfirmUpload(context.Background(), "user1", result.ProjectID)
	assert.ErrorContains(t, err, "check upload")
}

func TestProjectService_ConfirmUpload_DownloadURLFails(t *testing.T) {
	repo := newMockProjectRepo()
	storage := &failingDownloadURLStorageClient{mockStorageClient: *newMockStorageClient()}
	svc := NewProjectService(repo, storage)

	hash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art", ContentHash: hash})

	// Simulate blob existing so ObjectExists passes
	objPath := "projects/user1/" + hash + ".png"
	storage.objects[objPath] = true

	err := svc.ConfirmUpload(context.Background(), "user1", result.ProjectID)
	assert.ErrorContains(t, err, "download url failed")
}

func TestProjectService_DownloadBlob_ReadObjectFails(t *testing.T) {
	repo := newMockProjectRepo()
	storage := &failingReadObjectStorageClient{mockStorageClient: *newMockStorageClient()}
	svc := NewProjectService(repo, storage)

	hash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art", ContentHash: hash})

	_, err := svc.DownloadBlob(context.Background(), "user1", result.ProjectID)
	assert.ErrorContains(t, err, "read blob")
}

// --- GalleryService tests ---

func TestGalleryService_ShareAndGet(t *testing.T) {
	svc := NewGalleryService(newMockGalleryRepo())

	item := &model.GalleryItem{Name: "Sunset", CreatedAt: time.Now()}
	id, err := svc.ShareToGallery(context.Background(), "user1", item)
	require.NoError(t, err)

	got, err := svc.GetItem(context.Background(), "user1", id)
	require.NoError(t, err)
	assert.Equal(t, "Sunset", got.Name)
}

func TestGalleryService_GetItem_Unauthorized(t *testing.T) {
	svc := NewGalleryService(newMockGalleryRepo())

	item := &model.GalleryItem{Name: "Art"}
	id, _ := svc.ShareToGallery(context.Background(), "user1", item)

	_, err := svc.GetItem(context.Background(), "attacker", id)
	assert.ErrorContains(t, err, "unauthorized")
}

func TestGalleryService_DeleteItem_Unauthorized(t *testing.T) {
	svc := NewGalleryService(newMockGalleryRepo())

	item := &model.GalleryItem{Name: "Art"}
	id, _ := svc.ShareToGallery(context.Background(), "user1", item)

	err := svc.DeleteItem(context.Background(), "attacker", id)
	assert.ErrorContains(t, err, "unauthorized")
}

func TestGalleryService_GetItem_EmptyID(t *testing.T) {
	svc := NewGalleryService(newMockGalleryRepo())
	_, err := svc.GetItem(context.Background(), "user1", "")
	assert.ErrorContains(t, err, "item ID is required")
}

func TestGalleryService_GetItem_NotFound(t *testing.T) {
	svc := NewGalleryService(newMockGalleryRepo())
	_, err := svc.GetItem(context.Background(), "user1", "nonexistent")
	assert.Error(t, err)
}

func TestGalleryService_DeleteItem_EmptyID(t *testing.T) {
	svc := NewGalleryService(newMockGalleryRepo())
	err := svc.DeleteItem(context.Background(), "user1", "")
	assert.ErrorContains(t, err, "item ID is required")
}

func TestGalleryService_DeleteItem_NotFound(t *testing.T) {
	svc := NewGalleryService(newMockGalleryRepo())
	err := svc.DeleteItem(context.Background(), "user1", "nonexistent")
	assert.Error(t, err)
}

func TestGalleryService_DeleteItem_Success(t *testing.T) {
	svc := NewGalleryService(newMockGalleryRepo())
	id, _ := svc.ShareToGallery(context.Background(), "user1", &model.GalleryItem{Name: "Art"})
	err := svc.DeleteItem(context.Background(), "user1", id)
	require.NoError(t, err)
	_, err = svc.GetItem(context.Background(), "user1", id)
	assert.Error(t, err)
}

func TestGalleryService_ShareToGallery_ValidationFails(t *testing.T) {
	svc := NewGalleryService(newMockGalleryRepo())
	_, err := svc.ShareToGallery(context.Background(), "user1", &model.GalleryItem{Name: ""})
	assert.Error(t, err)
}

func TestGalleryService_ListItems_EmptyUID(t *testing.T) {
	svc := NewGalleryService(newMockGalleryRepo())
	_, err := svc.ListItems(context.Background(), "", 10, "")
	assert.ErrorContains(t, err, "uid is required")
}

func TestGalleryService_ListItems_DefaultPageSize(t *testing.T) {
	svc := NewGalleryService(newMockGalleryRepo())
	_, err := svc.ListItems(context.Background(), "user1", 0, "")
	require.NoError(t, err)
}

func TestGalleryService_ListItems_CapsPageSize(t *testing.T) {
	svc := NewGalleryService(newMockGalleryRepo())
	_, err := svc.ListItems(context.Background(), "user1", 100, "")
	require.NoError(t, err)
}

func TestGalleryService_ListItems_NegativePageSize(t *testing.T) {
	svc := NewGalleryService(newMockGalleryRepo())
	_, err := svc.ListItems(context.Background(), "user1", -1, "")
	require.NoError(t, err)
}

func TestGalleryService_CountItems(t *testing.T) {
	svc := NewGalleryService(newMockGalleryRepo())

	svc.ShareToGallery(context.Background(), "user1", &model.GalleryItem{Name: "A"})
	svc.ShareToGallery(context.Background(), "user1", &model.GalleryItem{Name: "B"})

	count, err := svc.CountItems(context.Background(), "user1")
	require.NoError(t, err)
	assert.Equal(t, int64(2), count)
}

func TestGalleryService_CountItems_EmptyUID(t *testing.T) {
	svc := NewGalleryService(newMockGalleryRepo())
	_, err := svc.CountItems(context.Background(), "")
	assert.ErrorContains(t, err, "uid is required")
}

// --- NFTService tests ---

func TestNFTService_CreateAndGet(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())

	nft := &model.NFT{Name: "CoolNFT", Price: 10.0}
	id, err := svc.CreateNFT(context.Background(), "user1", nft)
	require.NoError(t, err)

	got, err := svc.GetNFT(context.Background(), "user1", id)
	require.NoError(t, err)
	assert.Equal(t, "CoolNFT", got.Name)
}

func TestNFTService_GetNFT_Unauthorized(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())

	nft := &model.NFT{Name: "NFT"}
	id, _ := svc.CreateNFT(context.Background(), "user1", nft)

	_, err := svc.GetNFT(context.Background(), "attacker", id)
	assert.ErrorContains(t, err, "unauthorized")
}

func TestNFTService_DeleteNFT_Unauthorized(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())

	nft := &model.NFT{Name: "NFT"}
	id, _ := svc.CreateNFT(context.Background(), "user1", nft)

	err := svc.DeleteNFT(context.Background(), "attacker", id)
	assert.ErrorContains(t, err, "unauthorized")
}

func TestNFTService_CreateNFT_ValidationFails(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())
	_, err := svc.CreateNFT(context.Background(), "user1", &model.NFT{Name: "", Price: -1})
	assert.Error(t, err)
}

func TestNFTService_GetNFT_EmptyID(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())
	_, err := svc.GetNFT(context.Background(), "user1", "")
	assert.ErrorContains(t, err, "NFT ID is required")
}

func TestNFTService_GetNFT_NotFound(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())
	_, err := svc.GetNFT(context.Background(), "user1", "nonexistent")
	assert.Error(t, err)
}

func TestNFTService_DeleteNFT_EmptyID(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())
	err := svc.DeleteNFT(context.Background(), "user1", "")
	assert.ErrorContains(t, err, "NFT ID is required")
}

func TestNFTService_DeleteNFT_NotFound(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())
	err := svc.DeleteNFT(context.Background(), "user1", "nonexistent")
	assert.Error(t, err)
}

func TestNFTService_DeleteNFT_Success(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())
	id, _ := svc.CreateNFT(context.Background(), "user1", &model.NFT{Name: "NFT"})
	err := svc.DeleteNFT(context.Background(), "user1", id)
	require.NoError(t, err)
	_, err = svc.GetNFT(context.Background(), "user1", id)
	assert.Error(t, err)
}

func TestNFTService_ListNFTs_EmptyUID(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())
	_, err := svc.ListNFTs(context.Background(), "", 10, "")
	assert.ErrorContains(t, err, "uid is required")
}

func TestNFTService_ListNFTs_DefaultPageSize(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())
	_, err := svc.ListNFTs(context.Background(), "user1", 0, "")
	require.NoError(t, err)
}

func TestNFTService_ListNFTs_CapsPageSize(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())
	_, err := svc.ListNFTs(context.Background(), "user1", 100, "")
	require.NoError(t, err)
}

func TestNFTService_ListNFTs_NegativePageSize(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())
	_, err := svc.ListNFTs(context.Background(), "user1", -1, "")
	require.NoError(t, err)
}

func TestNFTService_CountNFTs(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())

	svc.CreateNFT(context.Background(), "user1", &model.NFT{Name: "A"})
	svc.CreateNFT(context.Background(), "user1", &model.NFT{Name: "B"})
	svc.CreateNFT(context.Background(), "user2", &model.NFT{Name: "C"})

	count, err := svc.CountNFTs(context.Background(), "user1")
	require.NoError(t, err)
	assert.Equal(t, int64(2), count)
}

func TestNFTService_CountNFTs_EmptyUID(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())
	_, err := svc.CountNFTs(context.Background(), "")
	assert.ErrorContains(t, err, "uid is required")
}

// --- Additional ProjectService coverage tests ---

func TestProjectService_UpdateProject_ValidationFails(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo, nil)
	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art"})

	longTitle := string(make([]byte, 201))
	update := &model.ProjectUpdate{Title: &longTitle}
	err := svc.UpdateProject(context.Background(), "user1", result.ProjectID, update)
	assert.ErrorContains(t, err, "validation")
}

func TestProjectService_CreateProject_BadThumbnail(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), nil)
	_, err := svc.CreateProject(context.Background(), "user1", &model.Project{
		Title:         "Art",
		ThumbnailData: "javascript:alert(1)",
	})
	assert.ErrorContains(t, err, "validation")
}

// --- UploadBlob tests ---

// validPNG returns a minimal valid PNG file (8-byte header + minimal IHDR).
func validPNG() []byte {
	// PNG magic + a few extra bytes to form a valid stream
	return append(
		[]byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A},
		[]byte("fake-png-body-data")...,
	)
}

func TestProjectService_UploadBlob_Success(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	hash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art", ContentHash: hash})

	err := svc.UploadBlob(context.Background(), "user1", result.ProjectID, bytes.NewReader(validPNG()))
	require.NoError(t, err)

	// Verify storageURL was set
	got, _ := svc.GetProject(context.Background(), "user1", result.ProjectID)
	assert.Contains(t, got.StorageURL, "download/")
}

func TestProjectService_UploadBlob_InvalidPNG(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	hash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art", ContentHash: hash})

	// Send an HTML file instead of PNG
	err := svc.UploadBlob(context.Background(), "user1", result.ProjectID, bytes.NewReader([]byte("<html>evil</html>")))
	assert.ErrorContains(t, err, "not a valid PNG")
}

func TestProjectService_UploadBlob_ShortBody(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	hash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art", ContentHash: hash})

	// Body too short to contain PNG header
	err := svc.UploadBlob(context.Background(), "user1", result.ProjectID, bytes.NewReader([]byte{0x89, 0x50}))
	assert.ErrorContains(t, err, "unable to read file header")
}

func TestProjectService_UploadBlob_EmptyID(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), newMockStorageClient())
	err := svc.UploadBlob(context.Background(), "user1", "", bytes.NewReader(validPNG()))
	assert.ErrorContains(t, err, "project ID is required")
}

func TestProjectService_UploadBlob_NoStorage(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo(), nil)
	err := svc.UploadBlob(context.Background(), "user1", "proj_1", bytes.NewReader(validPNG()))
	assert.ErrorContains(t, err, "storage is not configured")
}

func TestProjectService_UploadBlob_Unauthorized(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{
		Title:       "Art",
		ContentHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
	})

	err := svc.UploadBlob(context.Background(), "attacker", result.ProjectID, bytes.NewReader(validPNG()))
	assert.ErrorContains(t, err, "unauthorized")
}

func TestProjectService_UploadBlob_NoContentHash(t *testing.T) {
	repo := newMockProjectRepo()
	storage := newMockStorageClient()
	svc := NewProjectService(repo, storage)

	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art"})

	err := svc.UploadBlob(context.Background(), "user1", result.ProjectID, bytes.NewReader(validPNG()))
	assert.ErrorContains(t, err, "no content hash")
}

func TestProjectService_UploadBlob_WriteFails(t *testing.T) {
	repo := newMockProjectRepo()
	storage := &failingWriteObjectStorageClient{mockStorageClient: *newMockStorageClient()}
	svc := NewProjectService(repo, storage)

	hash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art", ContentHash: hash})

	err := svc.UploadBlob(context.Background(), "user1", result.ProjectID, bytes.NewReader(validPNG()))
	assert.ErrorContains(t, err, "write blob")
}

func TestProjectService_UploadBlob_DownloadURLFails(t *testing.T) {
	repo := newMockProjectRepo()
	storage := &failingDownloadURLStorageClient{mockStorageClient: *newMockStorageClient()}
	svc := NewProjectService(repo, storage)

	hash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	result, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Title: "Art", ContentHash: hash})

	err := svc.UploadBlob(context.Background(), "user1", result.ProjectID, bytes.NewReader(validPNG()))
	assert.ErrorContains(t, err, "download url failed")
}

// --- NFT blockchain field zeroing test ---

func TestNFTService_CreateNFT_ZerosBlockchainFields(t *testing.T) {
	svc := NewNFTService(newMockNFTRepo())

	nft := &model.NFT{
		Name:          "FakeNFT",
		TokenID:       "0.0.999",
		SerialNumber:  42,
		TransactionID: "0.0.999@1234567890.000",
	}
	id, err := svc.CreateNFT(context.Background(), "user1", nft)
	require.NoError(t, err)

	got, err := svc.GetNFT(context.Background(), "user1", id)
	require.NoError(t, err)
	assert.Empty(t, got.TokenID, "TokenID should be zeroed")
	assert.Zero(t, got.SerialNumber, "SerialNumber should be zeroed")
	assert.Empty(t, got.TransactionID, "TransactionID should be zeroed")
}

func TestProjectService_CreateProject_StorageURLStripped(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo, nil)
	result, err := svc.CreateProject(context.Background(), "user1", &model.Project{
		Title:      "Art",
		StorageURL: "https://evil.com/malicious.png",
	})
	require.NoError(t, err)

	project, _ := svc.GetProject(context.Background(), "user1", result.ProjectID)
	assert.Empty(t, project.StorageURL)
}
