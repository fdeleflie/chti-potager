#!/bin/bash
cd "$(dirname "$0")"

# On nettoie les anciens processus pour éviter les erreurs "Port in use"
killall node 2>/dev/null

# On lance vite sur le port 3009
npm run dev -- --port 3009 &

sleep 4
open "http://localhost:3009"
$SHELL