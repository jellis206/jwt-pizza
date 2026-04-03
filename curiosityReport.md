# Self-Hosting a Grafana Observability Stack on EC2

## Why I Went Down This Road

At my previous job at Breeze Airways we used NewRelic for observability. It was expensive, and the "free seats" they gave engineers to cut costs were basically useless — you could hardly see anything, couldn't query your own data in any meaningful way, and it was genuinely the worst developer experience I've dealt with. That left a bad taste in my mouth when it comes to managed observability platforms. So when this course introduced Grafana Cloud as the default path for metrics and logging, I saw an opportunity to do something I'd been wanting to try: self-host the entire observability stack and own the data end to end.

The goal was straightforward — stand up Grafana, a metrics backend, and a logs backend on a single EC2 instance, wire it into my jwt-pizza-service via OpenTelemetry, and have a setup where I control everything: retention, access, dashboards, the whole pipeline. No seat limits, no surprise bills, no vendor lock-in.

## The Decision: EC2 vs. ECS vs. Grafana Cloud

Before committing to EC2 I considered a few alternatives:

- **Grafana Cloud** — The managed option. Easy to set up, but you're renting someone else's infrastructure and playing by their rules. For a class project the free tier would have been fine, but I wanted to learn how the pieces actually fit together under the hood, not just point a datasource URL at someone else's API.
- **ECS (Fargate)** — This is how jwt-pizza-service itself is deployed, so there was some appeal to keeping everything in ECS. But running five long-lived containers on Fargate gets more expensive than a single EC2 instance, and you lose the simplicity of Docker Compose. ECS is great for stateless app containers that scale horizontally, but for a tightly coupled observability stack that just needs to stay up on one box, it's overkill.
- **Self-hosted on EC2** — Full control. I pick the tools, I own the data, I set the retention. The tradeoff is I'm responsible for keeping it running. For this project that's a feature, not a bug — I wanted to understand the operational side.

I went with EC2. A single `t3.small` instance in `us-east-1` running the full stack. Cost me about **$7/month** in compute, which is honestly more than Grafana Cloud's free tier for this scale of project, but the learning was worth significantly more than $7.

## The Stack

Everything runs in Docker Compose on the EC2 instance. Five containers:

<table>
  <tr>
    <th>Service</th>
    <th>Image</th>
    <th>Role</th>
  </tr>
  <tr>
    <td><b>VictoriaMetrics</b></td>
    <td><code>victoriametrics/victoria-metrics</code></td>
    <td>Time-series metrics storage (Prometheus-compatible)</td>
  </tr>
  <tr>
    <td><b>VictoriaLogs</b></td>
    <td><code>victoriametrics/victoria-logs</code></td>
    <td>Log aggregation and querying</td>
  </tr>
  <tr>
    <td><b>OpenTelemetry Collector</b></td>
    <td><code>otel/opentelemetry-collector-contrib</code></td>
    <td>Receives OTLP metrics, batches, and forwards to VictoriaMetrics</td>
  </tr>
  <tr>
    <td><b>Grafana</b></td>
    <td><code>grafana/grafana:11.0.0</code></td>
    <td>Dashboarding and visualization</td>
  </tr>
  <tr>
    <td><b>Caddy</b></td>
    <td><code>caddy:2</code></td>
    <td>Reverse proxy with automatic HTTPS</td>
  </tr>
</table>

The entire stack sits behind Caddy, which handles TLS automatically for `metrics.urjellis.com` via Let's Encrypt. Caddy routes traffic three ways:

- `/opentelemetry/*` goes to the OTel Collector (behind basic auth)
- `/victorialogs/*` goes to VictoriaLogs (behind basic auth)
- Everything else goes to Grafana

This means the jwt-pizza-service pushes metrics and logs to authenticated HTTPS endpoints on my domain, and I can hit Grafana in a browser on the same URL. One box, one domain, clean routing.

### Resource Usage

The whole stack is remarkably lightweight. At steady state the five containers use about **257 MB of RAM combined** on a 2 GB instance:

- Grafana: ~74 MB
- VictoriaMetrics: ~80 MB
- VictoriaLogs: ~53 MB
- OTel Collector: ~30 MB
- Caddy: ~20 MB

That leaves plenty of headroom. Disk usage sits at about 3.3 GB out of 20 GB with a 1-month retention period configured on both Victoria backends. This thing could comfortably run on an even smaller instance.

## Why VictoriaMetrics and VictoriaLogs Over Prometheus and Loki

This was one of the more interesting decisions. Prometheus and Loki are the "default" choices in the Grafana ecosystem, but when you're self-hosting on smaller hardware, performance matters a lot.

**VictoriaMetrics** is a drop-in replacement for Prometheus — it speaks PromQL, accepts Prometheus remote write, and works as a Grafana datasource with zero config changes. But it uses significantly less memory and disk than Prometheus, especially for high-cardinality metrics. On a `t3.small` with 2 GB of RAM, that difference matters. It's also a single binary with no external dependencies, which simplifies the deployment.

**VictoriaLogs** over Loki was a similar call. Loki requires careful label management to avoid high-cardinality blowups, and its query language (LogQL) has some rough edges. VictoriaLogs is simpler to operate, more memory-efficient, and accepts the same Loki push API format (`/loki/api/v1/push`), so from the application side the integration code looks identical. I didn't have to change my logger's payload format at all — it pushes structured JSON in Loki format and VictoriaLogs ingests it natively.

Both are open source (Apache 2.0 for the single-node versions), actively maintained, and built by the same team. For a resource-constrained self-hosted setup, they're the better choice in my opinion.

## The OpenTelemetry Pipeline

The metrics pipeline was where I spent the most time debugging. The jwt-pizza-service builds OTLP-format metric payloads in code and pushes them to the OTel Collector over HTTPS. The Collector batches them and writes to VictoriaMetrics via the Prometheus remote write protocol.

```
jwt-pizza-service --OTLP/HTTP--> Caddy --proxy--> OTel Collector --RemoteWrite--> VictoriaMetrics
```

One issue I ran into was getting the OTel Collector to correctly translate OTLP cumulative sums into something VictoriaMetrics could work with. The metric payloads include `startTimeUnixNano` and `timeUnixNano` fields, and if those aren't set correctly, VictoriaMetrics either drops the data points or misinterprets the counter resets. I had to make sure the `startTimeUnixNano` was anchored to process start time (not the current timestamp), so that the Collector could properly compute deltas across scrape intervals. Small detail, but it took a while to figure out why my counters looked wrong in Grafana.

The logging pipeline is simpler — the service pushes directly to VictoriaLogs through Caddy, no Collector in the middle:

```
jwt-pizza-service --Loki Push API--> Caddy --proxy--> VictoriaLogs
```

I chose not to route logs through the OTel Collector because VictoriaLogs natively accepts the Loki push format and adding another hop for logs didn't buy me anything. Keep it simple.

## CI/CD Integration

One thing worth mentioning is how the metrics and logging config flows through the CI pipeline. The jwt-pizza-service uses a `config.js` file that gets rewritten during CI with production secrets via `sed` replacements. Early on I ran into an issue where the `sed` commands for logging config were colliding with the metrics config because both had empty-string defaults. The fix was using unique placeholder strings (`logging-endpoint-placeholder`, `logging-account-placeholder`, etc.) instead of empty strings, so each `sed` replacement targets exactly the right line. Small thing, but the kind of gotcha that bites you in CI when you're managing multiple config blocks with string replacement.

## What I Learned

Building this gave me a much deeper understanding of the observability pipeline than I would have gotten by just plugging in a Grafana Cloud API key. I now understand:

- How OTel Collector pipelines work (receivers, processors, exporters) and the nuances of OTLP metric temporality
- The tradeoffs between managed and self-hosted observability, and specifically where managed solutions start costing real money at scale
- How Caddy can replace Nginx + Certbot with a fraction of the config for simple reverse proxy setups
- That VictoriaMetrics and VictoriaLogs are genuinely excellent alternatives to Prometheus and Loki, especially for smaller deployments

Coming from the NewRelic experience at Breeze, having full control over the observability stack — even on a tiny EC2 instance — feels right. No seat limits, no query restrictions, no surprise invoices. Just your data, your dashboards, your rules. For anyone considering self-hosting their observability tooling, I'd highly recommend starting with this stack. It's lightweight, open source, and the operational overhead is minimal once it's set up.

## References

- [VictoriaMetrics Documentation](https://docs.victoriametrics.com/)
- [VictoriaLogs Documentation](https://docs.victoriametrics.com/victorialogs/)
- [OpenTelemetry Collector Configuration](https://opentelemetry.io/docs/collector/configuration/)
- [Caddy Server Documentation](https://caddyserver.com/docs/)
- [Grafana OSS Documentation](https://grafana.com/docs/grafana/latest/)
- [OTLP Specification - Metrics](https://opentelemetry.io/docs/specs/otlp/#otlphttp-request)
