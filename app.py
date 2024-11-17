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

if IPINFO_TOKEN is None:
    print("Warning: IPINFO_TOKEN is not set. Make sure it's defined in the .env file.")

app = Flask(
    __name__,
    static_folder=os.path.join('backend', 'static'),  # Corrected path
    template_folder='templates'
)
CORS(app)  # Enable CORS for development

@app.route('/')
def home():
    return render_template('index.html')

# Route to check server status
@app.route('/check', methods=['GET'])
def check():
    server_ip = request.args.get('server')
    if not server_ip:
        return jsonify({"error": "No server IP provided"}), 400

    network_status = check_server(server_ip)
    return jsonify(network_status.to_dict())

# Function to validate IP address
def validate_ip(ip):
    try:
        ipaddress.ip_address(ip)
        return True
    except ValueError:
        return False

# Function to get geolocation data with error handling
def get_geolocation(ip):
    url = f"https://ipinfo.io/{ip}?token={IPINFO_TOKEN}"
    try:
        response = requests.get(url)
        response.raise_for_status()  # This will raise an HTTPError for bad responses
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching geolocation data for IP {ip}: {e}")
        return None

# Route to validate IP and get location data
@app.route('/validate_ip', methods=['GET'])
def validate_and_locate_ip():
    ip = request.args.get('ip')
    if not ip or not validate_ip(ip):
        return jsonify({"error": "Invalid IP address"}), 400

    location_data = get_geolocation(ip)
    if location_data:
        return jsonify(location_data)
    else:
        return jsonify({"error": "Could not retrieve location data"}), 500
    


def get_geolocation(ip):
    url = f"https://ipinfo.io/{ip}?token={IPINFO_TOKEN}"
    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()
        if 'loc' in data:
            latitude, longitude = data['loc'].split(',')
            data['latitude'] = latitude
            data['longitude'] = longitude
        return data
    else:
        return None


@app.route('/server_data', methods=['GET'])
def get_server_data():
    # List of server IPs you want to monitor
    ips_to_monitor =[{ip}] # Add actual IPs here

    servers = []
    for ip in ips_to_monitor:
        location_data = get_geolocation(ip)
        if location_data:
            servers.append({
                "ip": ip,
                "latitude": location_data["latitude"],
                "longitude": location_data["longitude"],
                "latency": 20,   # Replace with actual latency if available
                "uptime": 99.9,  # Replace with actual uptime if available
                "alertCount": 2  # Replace with actual alert count if available
            })

    return jsonify(servers)

# Initialize OpenAI API client
client = openai

# Function to interact with OpenAI API for IT support chatbot responses
def get_it_support_response(user_message):
    try:
        response = client.chat.completions.create(
            model="gpt-4o",  # or "gpt-3.5-turbo" if GPT-4 is not available
            messages=[
                {"role": "system", "content": "You are a helpful IT support assistant. Answer user questions in simple, easy-to-understand terms. Only respond to IT-related queries. If the question is not IT-related, politely inform the user that you can only assist with IT issues."},
                {"role": "user", "content": user_message}
            ],
            max_tokens=100,
            temperature=0.2
        )
        bot_response = response.choices[0].message.content.strip()
        return bot_response
    except Exception as e:
        print(f"Error in OpenAI API call: {str(e)}")
        return "Sorry, I'm having trouble processing your request right now. Please try again later."
    
# Route for handling chatbot messages
@app.route('/chat', methods=['POST'])
def chat():
    user_message = request.json.get("message")
    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    bot_response = get_it_support_response(user_message)
    return jsonify({"response": bot_response})

# if __name__ == '__main__':
#     app.run(debug=True, port=5000)
