"""mini-swe-agent's litellm model, priced by what OpenRouter billed.

litellm's price map covers only some models, so its estimate made `cost_limit`
apply to those alone. OpenRouter's `usage.cost` exists for every model and is
the amount actually charged.
"""

from minisweagent.models.litellm_model import LitellmModel


class OpenRouterBilledModel(LitellmModel):
    def _calculate_cost(self, response) -> dict[str, float]:
        cost = (response.model_dump().get("usage") or {}).get("cost")
        if cost is None:
            raise RuntimeError(f"{self.config.model_name}: response has no usage.cost")
        return {"cost": cost}
