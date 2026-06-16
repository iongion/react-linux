PROJECT_ROOT := $(shell pwd)

.PHONY: prepare prepare-system check format test build gnome gnome-smoke

prepare-system:
	@if [ "$$(uname -s)" = "Linux" ]; then \
		bash support/provision-deps.sh; \
	else \
		echo "Skipping Linux system dependency provisioning on $$(uname -s)"; \
	fi

prepare:
	yarn install --frozen-lockfile

check:
	yarn check-types
	yarn lint
	yarn test:run

format:
	yarn format

test:
	yarn test:run

build:
	yarn build

gnome:
	yarn gnome

gnome-smoke:
	yarn gnome-smoke
