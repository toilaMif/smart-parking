BOT_TOKEN = "8552479442:AAEChd3Lqsfrny7bmAn2OgA2pSxieC1N5yo"
CHAT_ID = "6017208398"

import requests

def send_message(text):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    requests.post(url, json={
        "chat_id": CHAT_ID,
        "text": text
    })