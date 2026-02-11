package service

import (
	"context"
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
	svc := NewProjectService(repo)

	project := &model.Project{Name: "My Art", IsPublic: false}
	id, err := svc.CreateProject(context.Background(), "user1", project)
	require.NoError(t, err)
	assert.NotEmpty(t, id)

	got, err := svc.GetProject(context.Background(), "user1", id)
	require.NoError(t, err)
	assert.Equal(t, "My Art", got.Name)
	assert.Equal(t, "user1", got.UserID)
}

func TestProjectService_GetProject_Unauthorized(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo)

	project := &model.Project{Name: "Private Art", IsPublic: false}
	id, _ := svc.CreateProject(context.Background(), "user1", project)

	_, err := svc.GetProject(context.Background(), "attacker", id)
	assert.ErrorContains(t, err, "unauthorized")
}

func TestProjectService_GetProject_PublicAllowed(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo)

	project := &model.Project{Name: "Public Art", IsPublic: true}
	id, _ := svc.CreateProject(context.Background(), "user1", project)

	got, err := svc.GetProject(context.Background(), "other_user", id)
	require.NoError(t, err)
	assert.Equal(t, "Public Art", got.Name)
}

func TestProjectService_UpdateProject_Unauthorized(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo)

	project := &model.Project{Name: "Art"}
	id, _ := svc.CreateProject(context.Background(), "user1", project)

	name := "Hacked"
	err := svc.UpdateProject(context.Background(), "attacker", id, &model.ProjectUpdate{Name: &name})
	assert.ErrorContains(t, err, "unauthorized")
}

func TestProjectService_DeleteProject_Unauthorized(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo)

	project := &model.Project{Name: "Art"}
	id, _ := svc.CreateProject(context.Background(), "user1", project)

	err := svc.DeleteProject(context.Background(), "attacker", id)
	assert.ErrorContains(t, err, "unauthorized")
}

func TestProjectService_DeleteProject_Success(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo)

	project := &model.Project{Name: "Art"}
	id, _ := svc.CreateProject(context.Background(), "user1", project)

	err := svc.DeleteProject(context.Background(), "user1", id)
	require.NoError(t, err)

	_, err = svc.GetProject(context.Background(), "user1", id)
	assert.Error(t, err) // should be gone
}

func TestProjectService_ListProjects(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo)

	for i := 0; i < 3; i++ {
		svc.CreateProject(context.Background(), "user1", &model.Project{Name: "Art"})
	}
	svc.CreateProject(context.Background(), "user2", &model.Project{Name: "Other"})

	projects, err := svc.ListProjects(context.Background(), "user1", 10, "")
	require.NoError(t, err)
	assert.Len(t, projects, 3)
}

func TestProjectService_ListProjects_CapsPageSize(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo)

	// Request 100 but max is 50 — service should cap it without error
	_, err := svc.ListProjects(context.Background(), "user1", 100, "")
	require.NoError(t, err)
}

func TestProjectService_CountProjects(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo)

	svc.CreateProject(context.Background(), "user1", &model.Project{Name: "A"})
	svc.CreateProject(context.Background(), "user1", &model.Project{Name: "B"})

	count, err := svc.CountProjects(context.Background(), "user1")
	require.NoError(t, err)
	assert.Equal(t, int64(2), count)
}

func TestProjectService_CreateProject_ValidationFails(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo())
	_, err := svc.CreateProject(context.Background(), "user1", &model.Project{Name: ""})
	assert.ErrorContains(t, err, "name is required")
}

func TestProjectService_ListProjects_EmptyUID(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo())
	_, err := svc.ListProjects(context.Background(), "", 10, "")
	assert.ErrorContains(t, err, "uid is required")
}

func TestProjectService_ListProjects_DefaultPageSize(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo)
	// limit 0 should default to DefaultPageSize
	_, err := svc.ListProjects(context.Background(), "user1", 0, "")
	require.NoError(t, err)
}

func TestProjectService_ListProjects_NegativePageSize(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo())
	_, err := svc.ListProjects(context.Background(), "user1", -5, "")
	require.NoError(t, err)
}

func TestProjectService_GetProject_EmptyID(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo())
	_, err := svc.GetProject(context.Background(), "user1", "")
	assert.ErrorContains(t, err, "project ID is required")
}

func TestProjectService_GetProject_NotFound(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo())
	_, err := svc.GetProject(context.Background(), "user1", "nonexistent")
	assert.Error(t, err)
}

func TestProjectService_UpdateProject_EmptyID(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo())
	name := "test"
	err := svc.UpdateProject(context.Background(), "user1", "", &model.ProjectUpdate{Name: &name})
	assert.ErrorContains(t, err, "project ID is required")
}

func TestProjectService_UpdateProject_NotFound(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo())
	name := "test"
	err := svc.UpdateProject(context.Background(), "user1", "nonexistent", &model.ProjectUpdate{Name: &name})
	assert.Error(t, err)
}

func TestProjectService_UpdateProject_Success(t *testing.T) {
	repo := newMockProjectRepo()
	svc := NewProjectService(repo)
	id, _ := svc.CreateProject(context.Background(), "user1", &model.Project{Name: "Art"})
	name := "Updated"
	err := svc.UpdateProject(context.Background(), "user1", id, &model.ProjectUpdate{Name: &name})
	assert.NoError(t, err)
}

func TestProjectService_DeleteProject_EmptyID(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo())
	err := svc.DeleteProject(context.Background(), "user1", "")
	assert.ErrorContains(t, err, "project ID is required")
}

func TestProjectService_DeleteProject_NotFound(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo())
	err := svc.DeleteProject(context.Background(), "user1", "nonexistent")
	assert.Error(t, err)
}

func TestProjectService_CountProjects_EmptyUID(t *testing.T) {
	svc := NewProjectService(newMockProjectRepo())
	_, err := svc.CountProjects(context.Background(), "")
	assert.ErrorContains(t, err, "uid is required")
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
