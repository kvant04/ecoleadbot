"""Локальный dev-сервер EcoLeadBot без кэширования.
Гарантирует, что браузер всегда получает свежие index.html / app.js / styles.css.
Запуск:  py serve.py   (затем открыть http://localhost:8000)
"""
import http.server
import socketserver

PORT = 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    # На Windows allow_reuse_address позволяет нескольким процессам сесть на
    # один порт одновременно — это приводит к зомби-серверам. Выключаем.
    allow_reuse_address = False


if __name__ == "__main__":
    try:
        with Server(("127.0.0.1", PORT), NoCacheHandler) as httpd:
            print("EcoLeadBot dev-server (no-cache) -> http://localhost:%d" % PORT, flush=True)
            httpd.serve_forever()
    except OSError as e:
        print("Не удалось запустить сервер на порту %d: %s" % (PORT, e), flush=True)
        raise
