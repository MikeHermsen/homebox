package mid

import (
	"net/http"
	"path"
	"strings"
)

const clearSiteDataCookie = "hb_site_data_cleared"

// ClearSiteDataOnce tells the browser to drop cached assets and site storage
// the first time it loads an HTML document after a deploy. This prevents stale
// service workers and chunk manifests from pinning old frontend bundles.
func ClearSiteDataOnce(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if shouldClearSiteData(r) {
			http.SetCookie(w, &http.Cookie{
				Name:     clearSiteDataCookie,
				Value:    "1",
				Path:     "/",
				MaxAge:   600,
				HttpOnly: true,
				SameSite: http.SameSiteLaxMode,
			})

			w.Header().Set("Clear-Site-Data", "\"cache\", \"storage\", \"executionContexts\"")
		}

		next.ServeHTTP(w, r)
	})
}

func shouldClearSiteData(r *http.Request) bool {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}

	if cookie, err := r.Cookie(clearSiteDataCookie); err == nil && cookie.Value == "1" {
		return false
	}

	if strings.HasPrefix(r.URL.Path, "/api") {
		return false
	}

	if accept := r.Header.Get("Accept"); strings.Contains(accept, "text/html") {
		return true
	}

	ext := path.Ext(r.URL.Path)
	return r.URL.Path == "/" || ext == "" || ext == ".html"
}
