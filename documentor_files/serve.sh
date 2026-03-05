#!/bin/bash
PORT=${1:-8080}
echo ""
echo "╔════════════════════════════════════════════════════════════════════════════════════╗"
echo "║                            Documentation Server Starting                           ║"
echo "╠════════════════════════════════════════════════════════════════════════════════════╣"
echo "║   Open in browser: http://localhost:$PORT/documentor_files/documentor_viewer.html  ║"
echo "║   Press Ctrl+C to stop                                                             ║"
echo "╚════════════════════════════════════════════════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")/.."
python3 -m http.server $PORT --bind 0.0.0.0 2>/dev/null || python -m http.server $PORT --bind 0.0.0.0
