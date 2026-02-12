package service

import (
	"context"
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/pandasWhoCode/paintbar/internal/model"
)

// --- Mock UserRepository ---

type mockUserRepo struct {
	mu        sync.Mutex
	users     map[string]*model.User
	usernames map[string]string // username -> uid
}

func newMockUserRepo() *mockUserRepo {
	return &mockUserRepo{
		users:     make(map[string]*model.User),
		usernames: make(map[string]string),
	}
}

func (r *mockUserRepo) GetByID(_ context.Context, uid string) (*model.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	u, ok := r.users[uid]
	if !ok {
		return nil, fmt.Errorf("user %s not found", uid)
	}
	copy := *u
	return &copy, nil
}

func (r *mockUserRepo) Create(_ context.Context, user *model.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.users[user.UID] = user
	return nil
}

func (r *mockUserRepo) Update(_ context.Context, uid string, update *model.UserUpdate) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	u, ok := r.users[uid]
	if !ok {
		return fmt.Errorf("user %s not found", uid)
	}
	m := update.ToUpdateMap()
	if v, ok := m["displayName"]; ok {
		u.DisplayName = v.(string)
	}
	if v, ok := m["bio"]; ok {
		u.Bio = v.(string)
	}
	if v, ok := m["location"]; ok {
		u.Location = v.(string)
	}
	if v, ok := m["website"]; ok {
		u.Website = v.(string)
	}
	if v, ok := m["twitterHandle"]; ok {
		u.TwitterHandle = v.(string)
	}
	return nil
}

func (r *mockUserRepo) ClaimUsername(_ context.Context, uid string, username string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, taken := r.usernames[username]; taken {
		return fmt.Errorf("username %q is already taken", username)
	}
	r.usernames[username] = uid
	if u, ok := r.users[uid]; ok {
		u.Username = username
	}
	return nil
}

// --- Mock ProjectRepository ---

type mockProjectRepo struct {
	mu       sync.Mutex
	projects map[string]*model.Project
	nextID   int
}

func newMockProjectRepo() *mockProjectRepo {
	return &mockProjectRepo{
		projects: make(map[string]*model.Project),
	}
}

func (r *mockProjectRepo) GetByID(_ context.Context, projectID string) (*model.Project, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	p, ok := r.projects[projectID]
	if !ok {
		return nil, fmt.Errorf("project %s not found", projectID)
	}
	copy := *p
	return &copy, nil
}

func (r *mockProjectRepo) FindByContentHash(_ context.Context, userID, contentHash string) (*model.Project, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, p := range r.projects {
		if p.UserID == userID && p.ContentHash == contentHash {
			copy := *p
			return &copy, nil
		}
	}
	return nil, nil
}

func (r *mockProjectRepo) FindByTitle(_ context.Context, userID, title string) (*model.Project, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, p := range r.projects {
		if p.UserID == userID && p.Title == title {
			copy := *p
			return &copy, nil
		}
	}
	return nil, nil
}

func (r *mockProjectRepo) List(_ context.Context, userID string, limit int, _ string) ([]*model.Project, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var result []*model.Project
	for _, p := range r.projects {
		if p.UserID == userID {
			copy := *p
			result = append(result, &copy)
			if len(result) >= limit {
				break
			}
		}
	}
	return result, nil
}

func (r *mockProjectRepo) Count(_ context.Context, userID string) (int64, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var count int64
	for _, p := range r.projects {
		if p.UserID == userID {
			count++
		}
	}
	return count, nil
}

func (r *mockProjectRepo) Create(_ context.Context, project *model.Project) (string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.nextID++
	id := fmt.Sprintf("proj_%d", r.nextID)
	project.ID = id
	r.projects[id] = project
	return id, nil
}

func (r *mockProjectRepo) Update(_ context.Context, projectID string, _ *model.ProjectUpdate) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.projects[projectID]; !ok {
		return fmt.Errorf("project %s not found", projectID)
	}
	return nil
}

func (r *mockProjectRepo) UpdateRaw(_ context.Context, projectID string, fields map[string]interface{}) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	p, ok := r.projects[projectID]
	if !ok {
		return fmt.Errorf("project %s not found", projectID)
	}
	if v, ok := fields["storageURL"]; ok {
		p.StorageURL = v.(string)
	}
	if v, ok := fields["contentHash"]; ok {
		p.ContentHash = v.(string)
	}
	if v, ok := fields["thumbnailData"]; ok {
		p.ThumbnailData = v.(string)
	}
	if v, ok := fields["width"]; ok {
		p.Width = v.(int)
	}
	if v, ok := fields["height"]; ok {
		p.Height = v.(int)
	}
	if v, ok := fields["isPublic"]; ok {
		p.IsPublic = v.(bool)
	}
	if v, ok := fields["tags"]; ok {
		p.Tags = v.([]string)
	}
	return nil
}

func (r *mockProjectRepo) Delete(_ context.Context, projectID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.projects[projectID]; !ok {
		return fmt.Errorf("project %s not found", projectID)
	}
	delete(r.projects, projectID)
	return nil
}

// --- Mock GalleryRepository ---

type mockGalleryRepo struct {
	mu     sync.Mutex
	items  map[string]*model.GalleryItem
	nextID int
}

func newMockGalleryRepo() *mockGalleryRepo {
	return &mockGalleryRepo{
		items: make(map[string]*model.GalleryItem),
	}
}

func (r *mockGalleryRepo) GetByID(_ context.Context, itemID string) (*model.GalleryItem, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	item, ok := r.items[itemID]
	if !ok {
		return nil, fmt.Errorf("gallery item %s not found", itemID)
	}
	copy := *item
	return &copy, nil
}

func (r *mockGalleryRepo) List(_ context.Context, userID string, limit int, _ string) ([]*model.GalleryItem, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var result []*model.GalleryItem
	for _, item := range r.items {
		if item.UserID == userID {
			copy := *item
			result = append(result, &copy)
			if len(result) >= limit {
				break
			}
		}
	}
	return result, nil
}

func (r *mockGalleryRepo) Count(_ context.Context, userID string) (int64, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var count int64
	for _, item := range r.items {
		if item.UserID == userID {
			count++
		}
	}
	return count, nil
}

func (r *mockGalleryRepo) Create(_ context.Context, item *model.GalleryItem) (string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.nextID++
	id := fmt.Sprintf("gal_%d", r.nextID)
	item.ID = id
	r.items[id] = item
	return id, nil
}

func (r *mockGalleryRepo) Delete(_ context.Context, itemID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.items[itemID]; !ok {
		return fmt.Errorf("gallery item %s not found", itemID)
	}
	delete(r.items, itemID)
	return nil
}

// --- Mock NFTRepository ---

type mockNFTRepo struct {
	mu     sync.Mutex
	nfts   map[string]*model.NFT
	nextID int
}

func newMockNFTRepo() *mockNFTRepo {
	return &mockNFTRepo{
		nfts: make(map[string]*model.NFT),
	}
}

func (r *mockNFTRepo) GetByID(_ context.Context, nftID string) (*model.NFT, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	nft, ok := r.nfts[nftID]
	if !ok {
		return nil, fmt.Errorf("nft %s not found", nftID)
	}
	copy := *nft
	return &copy, nil
}

func (r *mockNFTRepo) List(_ context.Context, userID string, limit int, _ string) ([]*model.NFT, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var result []*model.NFT
	for _, nft := range r.nfts {
		if nft.UserID == userID {
			copy := *nft
			result = append(result, &copy)
			if len(result) >= limit {
				break
			}
		}
	}
	return result, nil
}

func (r *mockNFTRepo) Count(_ context.Context, userID string) (int64, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var count int64
	for _, nft := range r.nfts {
		if nft.UserID == userID {
			count++
		}
	}
	return count, nil
}

func (r *mockNFTRepo) Create(_ context.Context, nft *model.NFT) (string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.nextID++
	id := fmt.Sprintf("nft_%d", r.nextID)
	nft.ID = id
	r.nfts[id] = nft
	return id, nil
}

func (r *mockNFTRepo) Update(_ context.Context, nftID string, _ map[string]interface{}) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.nfts[nftID]; !ok {
		return fmt.Errorf("nft %s not found", nftID)
	}
	return nil
}

func (r *mockNFTRepo) Delete(_ context.Context, nftID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.nfts[nftID]; !ok {
		return fmt.Errorf("nft %s not found", nftID)
	}
	delete(r.nfts, nftID)
	return nil
}

// --- Failing mock variants for error-path coverage ---

// failingFindByContentHashRepo fails on FindByContentHash.
type failingFindByContentHashRepo struct{ mockProjectRepo }

func (r *failingFindByContentHashRepo) FindByContentHash(_ context.Context, _, _ string) (*model.Project, error) {
	return nil, fmt.Errorf("firestore unavailable")
}

// failingFindByTitleRepo fails on FindByTitle.
type failingFindByTitleRepo struct{ mockProjectRepo }

func (r *failingFindByTitleRepo) FindByTitle(_ context.Context, _, _ string) (*model.Project, error) {
	return nil, fmt.Errorf("firestore unavailable")
}

// failingUploadStorageClient fails on GenerateUploadURL.
type failingUploadStorageClient struct{ mockStorageClient }

func (c *failingUploadStorageClient) GenerateUploadURL(_ string, _ time.Duration) (string, error) {
	return "", fmt.Errorf("storage unavailable")
}

// failingReadObjectStorageClient fails on ReadObject.
type failingReadObjectStorageClient struct{ mockStorageClient }

func (c *failingReadObjectStorageClient) ReadObject(_ context.Context, _ string) (io.ReadCloser, error) {
	return nil, fmt.Errorf("storage read failed")
}

// failingObjectExistsStorageClient fails on ObjectExists.
type failingObjectExistsStorageClient struct{ mockStorageClient }

func (c *failingObjectExistsStorageClient) ObjectExists(_ context.Context, _ string) (bool, error) {
	return false, fmt.Errorf("storage check failed")
}

// failingDownloadURLStorageClient fails on GenerateDownloadURL.
type failingDownloadURLStorageClient struct{ mockStorageClient }

func (c *failingDownloadURLStorageClient) GenerateDownloadURL(_ string, _ time.Duration) (string, error) {
	return "", fmt.Errorf("download url failed")
}
