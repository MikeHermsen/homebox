package v1

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/hay-kot/homebox/backend/internal/sys/validate"
	"github.com/hay-kot/httpkit/errchain"
	"github.com/hay-kot/httpkit/server"
	"github.com/rs/zerolog/log"
)

// AIAnalysisResult represents the suggested fields returned from OpenAI vision analysis.
type AIAnalysisResult struct {
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	SerialNumber string   `json:"serialNumber"`
	ModelNumber  string   `json:"modelNumber"`
	Manufacturer string   `json:"manufacturer"`
	Notes        string   `json:"notes"`
	Labels       []string `json:"labels"`
}

type openAIRequest struct {
	Model    string          `json:"model"`
	Messages []openAIMessage `json:"messages"`
	MaxTokens int           `json:"max_tokens"`
}

type openAIMessage struct {
	Role    string           `json:"role"`
	Content []openAIContent  `json:"content"`
}

type openAIContent struct {
	Type     string          `json:"type"`
	Text     string          `json:"text,omitempty"`
	ImageURL *openAIImageURL `json:"image_url,omitempty"`
}

type openAIImageURL struct {
	URL string `json:"url"`
}

type openAIResponse struct {
	Choices []openAIChoice `json:"choices"`
	Error   *openAIError   `json:"error,omitempty"`
}

type openAIChoice struct {
	Message openAIChoiceMessage `json:"message"`
}

type openAIChoiceMessage struct {
	Content string `json:"content"`
}

type openAIError struct {
	Message string `json:"message"`
}

// HandleItemAIAnalyze godoc
//
//	@Summary  Analyze item image with AI
//	@Tags     Items
//	@Accept   multipart/form-data
//	@Produce  json
//	@Param    file formData file true "Image to analyze"
//	@Success  200  {object} AIAnalysisResult
//	@Failure  400  {object} validate.ErrorResponse
//	@Failure  500  {object} validate.ErrorResponse
//	@Router   /v1/items/ai-analyze [POST]
//	@Security Bearer
func (ctrl *V1Controller) HandleItemAIAnalyze() errchain.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		if ctrl.openAIAPIKey == "" {
			return validate.NewRequestError(
				errors.New("AI analysis is not configured; set HBOX_OPENAI_API_KEY"),
				http.StatusBadRequest,
			)
		}

		err := r.ParseMultipartForm(ctrl.maxUploadSize << 20)
		if err != nil {
			log.Err(err).Msg("failed to parse multipart form")
			return validate.NewRequestError(errors.New("failed to parse multipart form"), http.StatusBadRequest)
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			log.Err(err).Msg("failed to get file from form")
			return validate.NewRequestError(errors.New("file is required"), http.StatusBadRequest)
		}
		defer file.Close()

		imgBytes, err := io.ReadAll(file)
		if err != nil {
			log.Err(err).Msg("failed to read file")
			return validate.NewRequestError(err, http.StatusInternalServerError)
		}

		contentType := header.Header.Get("Content-Type")
		if contentType == "" {
			contentType = http.DetectContentType(imgBytes)
		}

		if !strings.HasPrefix(contentType, "image/") {
			return validate.NewRequestError(errors.New("file must be an image"), http.StatusBadRequest)
		}

		b64 := base64.StdEncoding.EncodeToString(imgBytes)
		dataURI := fmt.Sprintf("data:%s;base64,%s", contentType, b64)

		result, err := callOpenAIVision(ctrl.openAIAPIKey, dataURI)
		if err != nil {
			log.Err(err).Msg("failed to analyze image with AI")
			return validate.NewRequestError(
				fmt.Errorf("AI analysis failed: %w", err),
				http.StatusInternalServerError,
			)
		}

		return server.JSON(w, http.StatusOK, result)
	}
}

func callOpenAIVision(apiKey string, imageDataURI string) (*AIAnalysisResult, error) {
	prompt := `You are an expert at identifying household items, electronics, appliances, and products from images. Analyze this image and extract as much information as possible about the item shown.

Return a JSON object with these fields:
- "name": A clear, concise title for the item (e.g. "Sony WH-1000XM5 Headphones")
- "description": A brief description of the item (max 200 chars)
- "serialNumber": The serial number if visible in the image, otherwise empty string
- "modelNumber": The model number if visible or identifiable, otherwise empty string
- "manufacturer": The brand/manufacturer if identifiable, otherwise empty string
- "notes": Any additional useful details about the item (condition, color, size, etc.)
- "labels": An array of 1-5 relevant category tags (e.g. ["electronics", "audio", "headphones"])

Return ONLY valid JSON, no markdown or extra text.`

	reqBody := openAIRequest{
		Model: "gpt-4o-mini",
		Messages: []openAIMessage{
			{
				Role: "user",
				Content: []openAIContent{
					{
						Type: "text",
						Text: prompt,
					},
					{
						Type: "image_url",
						ImageURL: &openAIImageURL{
							URL: imageDataURI,
						},
					},
				},
			},
		},
		MaxTokens: 1000,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to call OpenAI API: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var openAIResp openAIResponse
	if err := json.Unmarshal(respBody, &openAIResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if openAIResp.Error != nil {
		return nil, fmt.Errorf("OpenAI API error: %s", openAIResp.Error.Message)
	}

	if len(openAIResp.Choices) == 0 {
		return nil, errors.New("no response from AI")
	}

	content := openAIResp.Choices[0].Message.Content
	content = strings.TrimSpace(content)

	// Strip markdown code fences if present
	if strings.HasPrefix(content, "```") {
		lines := strings.Split(content, "\n")
		if len(lines) > 2 {
			lines = lines[1 : len(lines)-1]
			content = strings.Join(lines, "\n")
		}
	}

	var result AIAnalysisResult
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, fmt.Errorf("failed to parse AI response as JSON: %w", err)
	}

	return &result, nil
}
