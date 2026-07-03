PORT ?= 8000

.PHONY: help run stop restart open clean

help:
	@echo "Space Hand Pilot 3D"
	@echo ""
	@echo "  make run       Démarre le serveur (libère le port $(PORT) si occupé)"
	@echo "  make stop      Arrête le serveur sur le port $(PORT)"
	@echo "  make restart   Redémarre le serveur"
	@echo "  make open      Ouvre le jeu dans le navigateur"
	@echo "  make clean     Supprime fichiers temporaires et node_modules/"
	@echo ""
	@echo "  PORT=8080 make run   Utiliser un autre port"

run: stop
	@echo "→ http://localhost:$(PORT)"
	@echo "  Ctrl+C pour arrêter"
	python3 -m http.server $(PORT)

stop:
	@-lsof -ti :$(PORT) | xargs kill 2>/dev/null
	@echo "Port $(PORT) prêt"

restart: stop run

open:
	@open http://localhost:$(PORT)

clean:
	@echo "Nettoyage…"
	@find . -name '.DS_Store' -delete
	@find . -name 'Thumbs.db' -delete
	@find . -name '*.swp' -delete
	@find . -name '*.swo' -delete
	@find . -name '*.log' -delete
	@rm -rf node_modules
	@echo "Terminé"
