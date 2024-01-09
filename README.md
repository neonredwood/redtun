# Redtun

[![https://nodei.co/npm/@neonredwood%2Fredtun.png?downloads=true&downloadRank=true&stars=true&mini=true](https://nodei.co/npm/@neonredwood%2Fredtun.png?downloads=true&downloadRank=true&stars=true&mini=true)](https://www.npmjs.com/package/@neonredwood/redtun)

This project aims to be a self-hostable, deployable alternative to products like
[Cloudflare Tunnel](https://www.cloudflare.com/products/tunnel/) and [ngrok tunnels](https://ngrok.com/product/secure-tunnels),
both of which are already great, mature products. To deploy check out [our guide](https://www.neonredwood.com/blog/how-to-self-hosted-development-proxy-server).

It allows you to expose a local webserver behind a NAT or firewall to the public internet, using a self-hosted public relay.

This is useful in situation where you are developing against an API that requires HTTPS OAuth (or other) API endpoints.

<img width="694" alt="image" src="https://github.com/neonredwood/redtun/assets/382249/ae4584cb-d4b7-4ff8-89b5-8f269955001f">

## Deployment and Installation

The application consists of two pieces:

- The server, `redtun-server` which is intended to sit on the public internet, and accept incoming Websockets Tunnel connections from clients.
- The client, which is intended to be run locally, to create an outbound tunnel to the server and reverse proxy incoming HTTP requests to
  another local dev server (such as a next.js application)

For the intended use case, it is most useful to deploy `redtun-server` behind an `https://` endpoint with a wildcard SSL cert for
a subdomain you'd like to dedicate to this purpose.

For example, this could be deployed behind a webserver that responds to `https://*.dev.yourdomain.com`, alongside a wildcard SSL certificate for `*.dev.yourdomain.com`.
This would allow tunneling and proxying for developers using subdomains like `https://developer-username.dev.yourdomain.com`.

### Deploy the Server

The server is deployed as a [Docker image](https://hub.docker.com/r/phibit/redtun-server), and accepts two ENV variables which configure its
behavior:

- `PORT`: The port on which to run the server.
- `REDTUN_API_KEY`: A secret API key on which the authentication is based.

The sample [k8s deployment](k8s/redtun-server.yaml) can be modified to include an API key:

```diff
diff --git a/k8s/redtun-server.yaml b/k8s/redtun-server.yaml
index old..new 100644
--- a/k8s/redtun-server.yaml
+++ b/k8s/redtun-server.yaml
@@ -33,6 +33,9 @@ spec:
       containers:
         - name: web
           image: phibit/redtun-server:latest
+          env:
+            - name: REDTUN_API_KEY
+              value: your-api-key
           ports:
             - name: http
               containerPort: 3000
```

The docker image can also be run as follows:

```bash
$ docker run -e REDTUN_API_KEY=<your-api-key> -e PORT=3000 -p3002:3000 -it phibit/redtun-server:1.0.0
```

You can generate an API key on the command line with `openssl rand -hex 32`, or using a secure method of your choice.

#### Behind `nginx`

This server can also be deployed behind an existing nginx server or k8s ingress, with the following configuration:

```
# websockets upgrade support
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      keep-alive;
}

# dev tunnel proxy_pass
server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
   # implied herein is configuration of the wildcard SSL cert for
   # *.dev.yourdomain.com
  include "/etc/nginx/sites-available/mods/ssl.conf";
  server_name ~^(.*)\.dev\.yourdomain\.com$ ;
  location / {
    set $backend "http://redtun-server:3000";
    resolver 127.0.0.11 ipv6=off;

    proxy_pass $backend;
    proxy_set_header   Host             $host;
    proxy_set_header   X-Real-IP        $remote_addr;
    proxy_set_header   X-Forwarded-For  $proxy_add_x_forwarded_for;

    # WebSocket-specific headers
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;

    # This allows WebSocket connections to stay open
    proxy_read_timeout 86400; # 24 hours
    proxy_send_timeout 86400; # 24 hours
  }
}
```

**NOTE**: The server can be started without setting `REDTUN_API_KEY` which is _NOT RECOMMENDED_ because this
leaves the tunnel server open to the internet without authentication. This functionality is for
testing purposes only and may be removed in future versions.

### Deployment on GKE/Kubernetes

Take a look at the the guide, [how to deploy redtun self-hosted development proxy on GKE](https://www.neonredwood.com/blog/how-to-self-hosted-development-proxy-server).

### Run the Client

#### Configure the Client

To configure the client, you must set the API key and the address of the redtun-server. This can be done on the command line:

```bash
$ npx @neonredwood/redtun config api-key <your-generated-api-key>
$ npx @neonredwood/redtun config server https://yourdomain.com
```

Make sure to use the correct protocol (typically this would be an https endpoint for this use case).

#### Start the local tunnel

To start the client, run

```bash
$ npx @neonredwood/redtun start server 3000 -d <your-subdomain>.yourdomain.com
```

This reserves the `<your-subdomain>.example.com` for your client specifically, on a first-come first-served basis.

**NOTE**: there is currently no validation for subdomains, and it need not necessarily be related to the hosted server domain.

## Limitations and Improvements

- Although the application can be deployed behind a load balancer, there is no centralized mechanism for reserving forwarded subdomains, and as a result
  it is currently **only recommended to deploy this as a standalone application**. Future improvements will be made to centralize subdomain reservation
  to prevent collisions.

## Contributors

This project is heavily inspired by [web-tunnel/lite-http-tunnel](https://github.com/web-tunnel/lite-http-tunnel).

The main intentions behind forking and modifying the code were:

- porting to Typescript for type-safety
- containerizing certain elements (notably the server)
- distributing the CLI as a runnable via `npx`
