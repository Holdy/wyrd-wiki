# The development server: python's http.server, but telling the browser to check every file each time it is used,
# so an edited script (even one loaded later with import(), which a hard reload doesn't refetch) is always the new one.
# Like GitHub Pages, it serves foo.html for /foo and 404.html for anything missing.
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path) and os.path.isfile(path + ".html"):
            self.path = self.path.split("?")[0] + ".html"
        return super().send_head()

    def send_error(self, code, message=None, explain=None):
        if code != 404 or not os.path.isfile("404.html"):
            return super().send_error(code, message, explain)
        with open("404.html", "rb") as f:
            body = f.read()
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
http.server.ThreadingHTTPServer(("", port), NoCache).serve_forever()
