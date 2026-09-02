# sodium.json v1

The root shape is:

```json
{
  "$schema": "https://sodium.result.dev/schema/v1.json",
  "schemaVersion": 1,
  "app": {
    "name": "Example",
    "origins": ["http://localhost:3000", "https://example.com"]
  },
  "telemetry": { "enabled": true },
  "tools": []
}
```

Each tool requires `id`, `name`, `description`, `run`, and `risk`. `title`, `input`, `output`, `on`, and `confirmation` are optional.

```json
{
  "id": "tl_a1b2c3d4",
  "name": "open_product",
  "description": "Open one product using its stable product identifier.",
  "input": { "id": "string" },
  "on": ["/products/**"],
  "run": { "navigate": "/products/{id}" },
  "risk": "read_only"
}
```

Input fields are required by default. Use an object to add constraints or make a field optional:

```json
{
  "q": { "type": "string", "minLength": 1, "maxLength": 120 },
  "limit": { "type": "integer", "minimum": 1, "maximum": 50, "default": 10 },
  "cursor": { "type": "string", "optional": true }
}
```

## Run bindings

- Navigate: `{ "navigate": "/orders/{orderId}" }`
- Extract: `{ "extract": { "fields": [{ "name": "total", "selector": "[data-total]" }] } }`
- Form: `{ "form": { "selector": "form[data-sodium-id=search]", "fields": { "q": "query" } }`
- Interaction: `{ "interaction": { "steps": [{ "kind": "click", "selector": "[data-sodium-id=menu]" }] } }`
- Request: `{ "request": { "method": "POST", "path": "/api/cart", "body": { "encoding": "json", "fields": { "productId": "productId" } }, "response": "json" } }`
- Call: `{ "call": "searchProducts" }`

Routes accept strings or conditional objects:

```json
"on": ["/products/**", { "path": "/account", "when": "[data-authenticated]" }]
```

Risk is one of `read_only`, `reversible`, `state_changing`, `destructive`, or `financial`. Confirmation is `none`, `recommended`, or `required`; Sodium enforces minimums by risk.

`navigate`, `extract`, and GET requests must be read-only. Forms and interactions cannot be read-only. Requests remain same-origin and cannot specify arbitrary headers.
