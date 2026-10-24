package trevyn_test

import data.trevyn
import rego.v1

base := {
	"project": {"allowed_domains": ["shop.test", "*.staging.test"]},
	"environment": {"is_production": false},
	"plan": {"hosts": ["shop.test"], "side_effects": false, "high_risk_cases": []},
}

test_allowed_host if {
	trevyn.decision.allow with input as base
}

test_wildcard_host if {
	trevyn.decision.allow with input as object.union(base, {"plan": {"hosts": ["app.staging.test"], "side_effects": false, "high_risk_cases": []}})
}

test_offlist_host_denied if {
	d := trevyn.decision with input as object.union(base, {"plan": {"hosts": ["evil.example"], "side_effects": false, "high_risk_cases": []}})
	not d.allow
	d.reasons == ["target evil.example is not on the project allowlist"]
}

test_production_side_effects_need_approval if {
	inp := object.union(base, {"environment": {"is_production": true}, "plan": {"hosts": ["shop.test"], "side_effects": true, "high_risk_cases": []}})
	"requires_approval:production" in trevyn.decision.obligations with input as inp
}

test_high_risk_case_needs_approval if {
	inp := object.union(base, {"plan": {"hosts": ["shop.test"], "side_effects": false, "high_risk_cases": ["PAY-007"]}})
	trevyn.decision.obligations == ["requires_approval:high_risk_case"] with input as inp
}
