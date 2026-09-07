Alertmanager + Prometheus local test instructions

1) Replace the Slack webhook placeholder in `monitoring/alertmanager.yml`:

   - Open `monitoring/alertmanager.yml` and replace `REPLACE_WITH_YOUR_WEBHOOK` with your real Slack Incoming Webhook URL.
   - For security, do not commit the webhook to Git. Use Docker secrets, an env file mounted by your Compose, or copy the file locally and keep it out of source control.

2) Bring the stack up with Docker Compose:

```bash
# From repo root
docker-compose up --build
```

3) Wait for Prometheus to load rules and Alertmanager to start. The `ManualTestAlert` rule in `monitoring/alert_rules.yml` is configured to fire immediately (expr: `vector(1)`).

4) Verify delivery:

- Open Alertmanager UI: http://localhost:9093
- Open Prometheus UI: http://localhost:9090/alerts to inspect firing alerts
- Check the Slack channel configured in `alertmanager.yml` for the alert message.

5) Cleanup:

- Remove or comment out `ManualTestAlert` after testing to avoid repeated test alerts.
- To provide the webhook securely, consider using Docker secrets or mounting a file with the webhook at runtime rather than checking it into source control.
