package repository

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/pandasWhoCode/paintbar/internal/model"
	"google.golang.org/api/iterator"
)

// ProjectRepository defines the interface for project persistence operations.
type ProjectRepository interface {
	GetByID(ctx context.Context, projectID string) (*model.Project, error)
	FindByContentHash(ctx context.Context, userID, contentHash string) (*model.Project, error)
	FindByTitle(ctx context.Context, userID, title string) (*model.Project, error)
	List(ctx context.Context, userID string, limit int, startAfter string) ([]*model.Project, error)
	Count(ctx context.Context, userID string) (int64, error)
	Create(ctx context.Context, project *model.Project) (string, error)
	Update(ctx context.Context, projectID string, update *model.ProjectUpdate) error
	UpdateRaw(ctx context.Context, projectID string, fields map[string]interface{}) error
	Delete(ctx context.Context, projectID string) error
}

// firestoreProjectRepo implements ProjectRepository using Firestore.
type firestoreProjectRepo struct {
	client *firestore.Client
}

// NewProjectRepository creates a new Firestore-backed ProjectRepository.
func NewProjectRepository(client *firestore.Client) ProjectRepository {
	return &firestoreProjectRepo{client: client}
}

// GetByID retrieves a project by its document ID.
func (r *firestoreProjectRepo) GetByID(ctx context.Context, projectID string) (*model.Project, error) {
	doc, err := r.client.Collection("projects").Doc(projectID).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("get project %s: %w", projectID, err)
	}

	var project model.Project
	if err := doc.DataTo(&project); err != nil {
		return nil, fmt.Errorf("decode project %s: %w", projectID, err)
	}
	project.ID = doc.Ref.ID
	return &project, nil
}

// FindByContentHash looks up a project by user ID and content hash for deduplication.
// Returns nil, nil if no matching project is found.
func (r *firestoreProjectRepo) FindByContentHash(ctx context.Context, userID, contentHash string) (*model.Project, error) {
	iter := r.client.Collection("projects").
		Where("userId", "==", userID).
		Where("contentHash", "==", contentHash).
		Limit(1).
		Documents(ctx)
	defer iter.Stop()

	doc, err := iter.Next()
	if err == iterator.Done {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find project by content hash: %w", err)
	}

	var project model.Project
	if err := doc.DataTo(&project); err != nil {
		return nil, fmt.Errorf("decode project: %w", err)
	}
	project.ID = doc.Ref.ID
	return &project, nil
}

// FindByTitle looks up a project by user ID and title.
// Returns nil, nil if no matching project is found.
func (r *firestoreProjectRepo) FindByTitle(ctx context.Context, userID, title string) (*model.Project, error) {
	iter := r.client.Collection("projects").
		Where("userId", "==", userID).
		Where("title", "==", title).
		Limit(1).
		Documents(ctx)
	defer iter.Stop()

	doc, err := iter.Next()
	if err == iterator.Done {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find project by title: %w", err)
	}

	var project model.Project
	if err := doc.DataTo(&project); err != nil {
		return nil, fmt.Errorf("decode project: %w", err)
	}
	project.ID = doc.Ref.ID
	return &project, nil
}

// List retrieves projects for a user, ordered by createdAt descending, with cursor pagination.
func (r *firestoreProjectRepo) List(ctx context.Context, userID string, pageLimit int, startAfter string) ([]*model.Project, error) {
	q := r.client.Collection("projects").
		Where("userId", "==", userID).
		OrderBy("createdAt", firestore.Desc).
		Limit(pageLimit)

	// Cursor-based pagination: start after a specific document
	if startAfter != "" {
		cursorDoc, err := r.client.Collection("projects").Doc(startAfter).Get(ctx)
		if err != nil {
			// If cursor doc doesn't exist, return empty results rather than
			// exposing whether a document ID exists (information disclosure).
			return []*model.Project{}, nil
		}
		q = q.StartAfter(cursorDoc)
	}

	iter := q.Documents(ctx)
	defer iter.Stop()

	var projects []*model.Project
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("iterate projects: %w", err)
		}

		var p model.Project
		if err := doc.DataTo(&p); err != nil {
			return nil, fmt.Errorf("decode project: %w", err)
		}
		p.ID = doc.Ref.ID
		projects = append(projects, &p)
	}

	return projects, nil
}

// Count returns the total number of projects for a user using Firestore aggregation.
func (r *firestoreProjectRepo) Count(ctx context.Context, userID string) (int64, error) {
	q := r.client.Collection("projects").Where("userId", "==", userID)
	results, err := q.NewAggregationQuery().WithCount("count").Get(ctx)
	if err != nil {
		return 0, fmt.Errorf("count projects: %w", err)
	}

	count, ok := results["count"]
	if !ok {
		return 0, nil
	}

	// AggregationResult values are returned as *firestorepb.Value;
	// the firestore SDK converts them to interface{} — typically int64.
	switch v := count.(type) {
	case int64:
		return v, nil
	case float64:
		return int64(v), nil
	default:
		return 0, fmt.Errorf("unexpected count type: %T", count)
	}
}

// Create adds a new project to Firestore and returns the generated document ID.
func (r *firestoreProjectRepo) Create(ctx context.Context, project *model.Project) (string, error) {
	now := time.Now()
	project.CreatedAt = now
	project.UpdatedAt = now

	ref, _, err := r.client.Collection("projects").Add(ctx, project)
	if err != nil {
		return "", fmt.Errorf("create project: %w", err)
	}

	project.ID = ref.ID
	return ref.ID, nil
}

// Update applies a partial update to a project document.
func (r *firestoreProjectRepo) Update(ctx context.Context, projectID string, update *model.ProjectUpdate) error {
	updates := update.ToUpdateMap()
	_, err := r.client.Collection("projects").Doc(projectID).Set(ctx, updates, firestore.MergeAll)
	if err != nil {
		return fmt.Errorf("update project %s: %w", projectID, err)
	}
	return nil
}

// UpdateRaw applies a raw map of field updates to a project document.
// Used for internal updates (e.g. setting storageURL) that aren't part of ProjectUpdate.
func (r *firestoreProjectRepo) UpdateRaw(ctx context.Context, projectID string, fields map[string]interface{}) error {
	_, err := r.client.Collection("projects").Doc(projectID).Set(ctx, fields, firestore.MergeAll)
	if err != nil {
		return fmt.Errorf("update raw project %s: %w", projectID, err)
	}
	return nil
}

// Delete removes a project document from Firestore.
func (r *firestoreProjectRepo) Delete(ctx context.Context, projectID string) error {
	_, err := r.client.Collection("projects").Doc(projectID).Delete(ctx)
	if err != nil {
		return fmt.Errorf("delete project %s: %w", projectID, err)
	}
	return nil
}
