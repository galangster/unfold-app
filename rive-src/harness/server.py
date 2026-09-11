import http.server, base64, os, urllib.parse
class H(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        q=urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query); name=os.path.basename(q.get('name',['strip'])[0])
        data=self.rfile.read(int(self.headers['Content-Length'])).decode(); png=base64.b64decode(data.split(',',1)[1])
        os.makedirs('strips',exist_ok=True); p=os.path.join('strips',name+'.png'); open(p,'wb').write(png)
        self.send_response(200); self.end_headers(); self.wfile.write(p.encode())
    def log_message(self,*a): pass
os.chdir(os.path.dirname(os.path.abspath(__file__)))
http.server.ThreadingHTTPServer(('127.0.0.1',8799),H).serve_forever()
