from PIL import Image
from sw_utils import get_child_paths,lang_detect,is_image,decode_base64,save_json_file,create_dir
import PIL.PngImagePlugin
import os
import json

card_dir = "./data/sillytavern_cards"
names = os.listdir(card_dir)

for name in names:
    path = os.path.join(card_dir, name)
    role_code = name.split('.')[0].replace(" ","_")
    if is_image(path):
        with open(path, 'rb',encoding="utf-8") as f:
            image = Image.open(f)
            card_info = json.loads(decode_base64(image.text['chara']))
            language = lang_detect(card_info['data']['description'])
            role_info = {
            "role_code": f"{role_code}-{language}",
            "role_name": card_info['data']['name'],
            "source": "",
            "profile": card_info['data']['description'],
            "nickname": card_info['data']['name'],
            "relation": {},
            "card_data": card_info['data']
            }
            create_dir(f"./data/roles/sillytavern/{role_code}")
            save_json_file(os.path.join(f"./data/roles/sillytavern/{role_code}","role_info.json"),role_info)
            image.save(os.path.join(f"./data/roles/sillytavern/{role_code}",f"icon.png"))
            print(f"{name} converted successfully.")
    