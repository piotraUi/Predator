#!/usr/bin/env bash
# Instalacja serwera Predatora na świeżej maszynie Linux (np. Google Cloud, Ubuntu 24.04).
# Robi wszystko naraz:
#  - Node.js 22, Caddy (darmowy certyfikat HTTPS), plik wymiany (żeby budowanie gry się mieściło),
#  - DuckDNS: adres twoja-nazwa.duckdns.org wskazuje na tę maszynę (odświeżany co 5 minut),
#  - serwer gry jako usługa systemu: startuje sam po restarcie maszyny i po awarii,
#  - https://twoja-nazwa.duckdns.org -> serwer gry (czat głosowy działa też w przeglądarce).
#
# Uruchom w folderze pobranym przez git clone:
#   sudo bash Predator/scripts/setup-linux-server.sh
# Można podać dane z góry: sudo DUCK_SUB=nazwa DUCK_TOKEN=... GROQ_API_KEY=... bash ...
set -euo pipefail

if [ "$(id -u)" != "0" ]; then
  echo "Uruchom przez sudo: sudo bash $0"
  exit 1
fi

DIR="$(cd "$(dirname "$0")/.." && pwd)"
OWNER="${SUDO_USER:-root}"
ask() {
  local v
  read -r -p "$1" v </dev/tty
  printf '%s' "$v"
}

echo "== Serwer Predatora: $DIR (użytkownik: $OWNER) =="
DUCK_SUB="${DUCK_SUB:-$(ask "Nazwa w DuckDNS (np. mojpredator dla mojpredator.duckdns.org): ")}"
DUCK_SUB="${DUCK_SUB%.duckdns.org}"
DUCK_SUB="${DUCK_SUB#https://}"
DUCK_TOKEN="${DUCK_TOKEN:-$(ask "Token DuckDNS (na górze strony duckdns.org po zalogowaniu): ")}"
GROQ_KEY="${GROQ_API_KEY:-$(ask "Klucz Groq do moderacji AI (Enter = pomiń, można dodać później w panelu admina): ")}"
if [ -z "$DUCK_SUB" ] || [ -z "$DUCK_TOKEN" ]; then
  echo "Potrzebna jest nazwa i token DuckDNS."
  exit 1
fi
DOMAIN="$DUCK_SUB.duckdns.org"

echo "== Pakiety systemu =="
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

echo "== Node.js 22 =="
if ! node -v 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "== Caddy (HTTPS) =="
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

echo "== Plik wymiany 2 GB (budowanie gry na mniejszych maszynach) =="
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

echo "== DuckDNS: $DOMAIN =="
cat >/usr/local/bin/duckdns-update.sh <<EOF
#!/usr/bin/env bash
# adres $DOMAIN -> obecny adres IP tej maszyny
curl -fsS "https://www.duckdns.org/update?domains=$DUCK_SUB&token=$DUCK_TOKEN&ip=" -o /var/log/duckdns.log
EOF
chmod 700 /usr/local/bin/duckdns-update.sh
echo "*/5 * * * * root /usr/local/bin/duckdns-update.sh >/dev/null 2>&1" >/etc/cron.d/duckdns
/usr/local/bin/duckdns-update.sh || true
if [ "$(cat /var/log/duckdns.log 2>/dev/null)" != "OK" ]; then
  echo "Uwaga: DuckDNS nie odpowiedział OK - sprawdź nazwę i token (plik /usr/local/bin/duckdns-update.sh)."
fi

echo "== Ustawienia serwera gry (/etc/predator.env) =="
umask 077
{
  echo "PORT=2567"
  [ -n "$GROQ_KEY" ] && echo "GROQ_API_KEY=$GROQ_KEY"
} >/etc/predator.env
umask 022

echo "== Usługa systemu: predator =="
chown -R "$OWNER":"$OWNER" "$DIR"
cat >/etc/systemd/system/predator.service <<EOF
[Unit]
Description=Serwer gry Predator
After=network-online.target
Wants=network-online.target

[Service]
User=$OWNER
WorkingDirectory=$DIR
EnvironmentFile=/etc/predator.env
ExecStart=/usr/bin/env bash $DIR/start-server.sh
Restart=always
RestartSec=5
# aktualizacja z panelu admina buduje grę - może to chwilę potrwać
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

echo "== HTTPS: https://$DOMAIN -> serwer gry =="
cat >/etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy localhost:2567
}
EOF

systemctl daemon-reload
systemctl enable --now predator
systemctl restart caddy

echo "== Czekam, aż serwer zbuduje grę i wystartuje (pierwszy raz kilka minut)... =="
for i in $(seq 1 120); do
  if curl -fs -m 3 http://localhost:2567/health >/dev/null 2>&1; then
    echo "Serwer działa!"
    break
  fi
  sleep 5
done

IP="$(curl -fs -m 5 https://api.ipify.org || echo "?")"
echo
echo "================================================================"
echo " Gotowe!"
echo "  Strona gry:           https://$DOMAIN"
echo "  W aplikacjach wpisz:  https://$DOMAIN"
echo "  (bez https też działa: http://$IP:2567)"
echo "  Konto administratora: $DIR/data/konto-predator.txt"
echo "  Gemini (asystent AI): panel admina → AI → Wgraj plik klucza JSON"
echo
echo "  Logi serwera:         sudo journalctl -u predator -f"
echo "  Restart serwera:      sudo systemctl restart predator"
echo "  Aktualizacja:         panel admina → Serwer → Aktualizuj"
echo "================================================================"
