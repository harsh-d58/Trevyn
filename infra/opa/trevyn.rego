# Trevyn policy gate (blueprint Step 7). Same rules as services/api/trevyn_api/policy.py:evaluate.
# The API posts {"input": ...} to /v1/data/trevyn/decision and fails closed if OPA is unreachable.
package trevyn

import rego.v1

default limits := {"load_vus_without_approval": 20}

decision := {"allow": count(deny) == 0, "reasons": sort([r | some r in deny]), "obligations": sort([o | some o in obligations])}

deny contains msg if {
	some h in input.plan.hosts
	not host_allowed(h)
	msg := sprintf("target %s is not on the project allowlist", [h])
}

obligations contains "requires_approval:production" if {
	input.environment.is_production
	input.plan.side_effects
}

obligations contains "requires_approval:high_risk_case" if {
	count(input.plan.high_risk_cases) > 0
}

host_allowed(h) if {
	some d in input.project.allowed_domains
	h == d
}

host_allowed(h) if {
	some d in input.project.allowed_domains
	startswith(d, "*.")
	endswith(h, substring(d, 1, -1))
}
