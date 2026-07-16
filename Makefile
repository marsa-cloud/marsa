.PHONY: e2e e2e-down

e2e:
	bash scripts/e2e-up.sh $(ARGS)

e2e-down:
	bash scripts/e2e-down.sh
