from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from backend.network_service import check_server
import ipaddress
import requests
from dotenv import load_dotenv
import os
import openai

# Load environment variables
load_dotenv()
IPINFO_TOKEN = os.getenv('IPINFO_TOKEN')
openai.api_key = os.getenv("OPENAI_API_KEY")

# Optional: Warn if IPINFO_TOKEN is missing
if IPINFO_TOKEN is None:
    print("Warning: IPINFO_TOKEN is not set. Make sure it's defined in the .env file.")

app = Flask(
    __name__,
    static_folder='backend/static',  # where your JS and other static files reside
    template_folder='templates'      # for your .html templates
)
CORS(app)  # Enable CORS during development

@app.route('/')
def home():
    """
    Render the main page (index.html).
    """
    return render_template('index.html')


# ------------------- Network Checking Endpoint ------------------- #
@app.route('/check', methods=['GET'])
def check():
    """
    /check?server=1.1.1.1
    Calls check_server to measure latency/status and return as JSON.
    """
    server_ip = request.args.get('server')
    if not server_ip:
        return jsonify({"error": "No server IP provided"}), 400

    network_status = check_server(server_ip)
    return jsonify(network_status.to_dict())


# ------------------- IP Validation + Geolocation ------------------- #

def validate_ip(ip):
    """
    Validate the IP using ipaddress (standard library).
    """
    try:
        ipaddress.ip_address(ip)
        return True
    except ValueError:
        return False

def get_geolocation(ip):
    """
    Fetch geolocation data from ipinfo.io using your IPINFO_TOKEN.
    Parse out latitude, longitude from 'loc' if present.
    """
    url = f"https://ipinfo.io/{ip}?token={IPINFO_TOKEN}"
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()

        # If 'loc' in data, parse out lat/long
        if 'loc' in data:
            lat, lon = data['loc'].split(',')
            data['latitude'] = lat
            data['longitude'] = lon

        return data
    except requests.exceptions.RequestException as e:
        print(f"Error fetching geolocation data for IP {ip}: {e}")
        return None

@app.route('/validate_ip', methods=['GET'])
def validate_and_locate_ip():
    """
    /validate_ip?ip=8.8.8.8
    Validates the IP and returns geolocation data if valid.
    """
    ip = request.args.get('ip')
    if not ip or not validate_ip(ip):
        return jsonify({"error": "Invalid IP address"}), 400

    location_data = get_geolocation(ip)
    if location_data:
        return jsonify(location_data)
    else:
        return jsonify({"error": "Could not retrieve location data"}), 500


# ------------------- Return Basic Server Data for Map ------------------- #

@app.route('/server_data', methods=['GET'])
def get_server_data():
    """
    Returns a list of servers with lat, long, etc. for the Leaflet map.
    """
    # List of server IPs you want to display on the map
    ips_to_monitor = ["8.8.8.8", "1.1.1.1"]  # adjust as needed

    servers = []
    for ip in ips_to_monitor:
        location_data = get_geolocation(ip)
        # Only add if we got valid location info
        if location_data and "latitude" in location_data and "longitude" in location_data:
            servers.append({
                "ip": ip,
                "latitude": location_data["latitude"],
                "longitude": location_data["longitude"],
                "latency": 20,    # placeholder
                "uptime": 99.9,   # placeholder
                "alertCount": 2   # placeholder
            })

    return jsonify(servers)


# ------------------- OpenAI Chatbot Endpoint ------------------- #
client = openai

def get_it_support_response(user_message):
    """
    Use OpenAI's Chat Completions to respond to user messages.
    """
    try:
        response = client.ChatCompletion.create(
            model="gpt-4o",  # or "gpt-4" if you have access
            messages=[
                {"role": "system", "content": "You are a helpful IT support assistant..."},
                {"role": "user", "content": user_message}
            ],
            max_tokens=100,
            temperature=0.2
        )
        bot_response = response.choices[0].message.content.strip()
        return bot_response
    except Exception as e:
        print(f"Error in OpenAI API call: {str(e)}")
        return "Sorry, I'm having trouble processing your request right now."

@app.route('/chat', methods=['POST'])
def chat():
    """
    Expects JSON: { message: "User's message" }
    Returns JSON: { response: "Bot's response" }
    """
    user_message = request.json.get("message")
    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    bot_response = get_it_support_response(user_message)
    return jsonify({"response": bot_response})


# ------------------- Run the Flask App ------------------- #
# if __name__ == '__main__':
#     app.run(debug=True, port=5000)
