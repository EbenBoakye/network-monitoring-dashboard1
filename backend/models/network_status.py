# backend/models/network_status.py

class NetworkStatus:
    def __init__(self, server, is_up, latency):
        self.server = server
        self.is_up = is_up
        self.latency = latency

    def to_dict(self):
        return {
            "server": self.server,
            "is_up": self.is_up,
            "latency": self.latency
        }
