import http from 'node:http';
export function isolatedPdf(html: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: process.env.CRM_PDF_SOCKET,
        path: '/render',
        method: 'POST',
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(html),
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(Error('Renderizador PDF no disponible'));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > 10 * 1024 * 1024) {
            req.destroy(Error('PDF demasiado grande'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      },
    );
    const timeout = setTimeout(() => req.destroy(Error('Tiempo de PDF agotado')), 60000);
    req.on('close', () => clearTimeout(timeout));
    req.on('error', reject);
    req.end(html);
  });
}
