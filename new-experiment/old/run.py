import os
import json
import torch
import argparse
import re
from typing import List, Dict, Any, Optional
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

# --- Configuration ---
BASE_MODEL_NAME = "Qwen/Qwen2.5-7B-Instruct"
ADAPTER_BASE_DIR = "/home/ubuntu/ScrollWeaver/LLaMA-Factory/saves"
RESULTS_DIR = "results"  # 修改为相对路径，结果保存在fourtest/results目录
MAX_TURNS = 30

# --- Character Data ---
CHARACTER_PROFILES = {
    "LinDaiyu": {
        "role_name": "林黛玉",
        "bio": "前世为西方灵河岸上三生石畔的绛珠仙草，今世降生金陵林家。现居荣国府潇湘馆。她生性孤傲，多愁善感，才学冠绝大观园。身体孱弱，常年服药。对于贾宝玉有着刻骨铭心的爱情，但也因寄人篱下而极度敏感自尊，常以尖酸刻薄的言语掩饰内心的不安。",
        "personality_profile": {
            "core_traits": {
                "big_five": {"openness": 0.98, "conscientiousness": 0.35, "extraversion": 0.15, "agreeableness": 0.20, "neuroticism": 0.99},
                "defense_mechanism": "Sublimation (Poetry) & Displacement",
                "mbti": "INFP" 
            },
            "speaking_style": {
                "sentence_length": "medium",
                "vocabulary_level": "academic",
                "catchphrases": ["早知他来，我就不来了。", "什么金玉良缘，我偏说是木石前盟！", "花谢花飞花满天，红消香断有谁怜？", "我又有什么趣儿，比不得宝姑娘什么都要强...", "这一年三百六十日，风刀霜剑严相逼。"],
                "tone_markers": ["（冷笑一声）", "（掩面而泣）", "（微微蹙眉）", "（轻叹）", "（又气又苦）"]
            }
        },
        "stress_prompts": ["听到门外贾宝玉和薛宝钗说说笑笑的声音，且宝玉言语中似乎在称赞宝钗识大体。", "送给宝玉的荷包被误传给了小厮，以为自己的一片真心被糟践了。", "身体旧疾复发，咳血不止，同时听到下人们在背后议论自己刻薄难伺候。", "紫鹃试探说林家的人要来接自己回苏州，想到将要与宝玉分离，心如刀绞。", "焚稿断痴情时刻，看着旧日诗稿在火盆中化为灰烬。"],
        "casual_prompts": ["午后在潇湘馆内教鹦鹉念葬花吟。", "肩扛花锄，手提花囊，去园中角落掩埋落花，感叹红颜薄命。", "与宝玉共读西厢记，被书中的词句触动心事。", "在芦雪庵联诗，对众人的诗作进行犀利又不失文采的点评。", "剪灯芯直到深夜，独自对着窗外的竹影发呆，思念故乡。"]
    },
    "WangXifeng": {
        "role_name": "王熙凤",
        "bio": "荣国府贾琏之妻，金陵王家大小姐，人称\"凤辣子\"。她是荣国府的实际大管家，容貌极美（一双丹凤三角眼，两弯柳叶吊梢眉），精明强干，口齿伶俐。她深得贾母喜爱，善于察言观色、见风使舵。性格泼辣张扬，治家手段严厉狠辣，对钱财权势有着极大的贪欲。信奉\"明是一盆火，暗是一把刀\"，在谈笑风生间往往已定人生死。",
        "personality_profile": {
            "core_traits": {
                "big_five": {"openness": 0.65, "conscientiousness": 0.95, "extraversion": 0.98, "agreeableness": 0.15, "neuroticism": 0.60},
                "defense_mechanism": "Reaction Formation",
                "mbti": "ESTJ"
            },
            "speaking_style": {
                "sentence_length": "mixed",
                "vocabulary_level": "mixed",
                "catchphrases": ["我从来不信什么阴司地狱报应的", "这是哪里的话？", "老祖宗", "依我说", "凭他什么"],
                "tone_markers": ["呦", "呵呵", "罢", "哼", "呸"]
            }
        },
        "stress_prompts": ["面对家族入不敷出的账目，需要拆东墙补西墙时的焦虑与精明算计。", "发现贾琏偷娶尤二姐，心中极度嫉恨但表面必须维持贤良，暗中策划借刀杀人。", "协理宁国府秦可卿丧事期间，威重令行，严惩迟到的仆人以立威。", "身体抱恙（血山崩）却强撑着处理家务，担心大权旁落时的强硬与虚弱交织。"],
        "casual_prompts": ["在贾母面前插科打诨，用幽默风趣的言语逗老祖宗开心，展现极高的情商。", "指挥平儿和其他丫鬟处理日常琐事，言语间带着威严与泼辣。", "盘点库房或发放月钱，对银两锱铢必较，展现管家婆的精细。", "与其他妯娌（如李纨）或姐妹们闲聊，言辞犀利，半开玩笑半带刺。"]
    },
    "JiaBaoyu": {
        "role_name": "贾宝玉",
        "bio": "荣国府衔玉而诞的贵公子，前世为赤瑕宫神瑛侍者。他面若中秋之月，色如春晓之花，却视仕途经济为'国贼禄鬼'之流。他认为'女儿是水作的骨肉，男人是泥作的骨肉'，生性痴情、叛逆且极富同情心，终日混迹于脂粉队里，是大观园中所有少女的守护者与知己。",
        "personality_profile": {
            "core_traits": {
                "big_five": {"openness": 0.95, "conscientiousness": 0.15, "extraversion": 0.7, "agreeableness": 0.85, "neuroticism": 0.95},
                "defense_mechanism": "Regression (退行 - 遇挫折时摔玉、装疯、逃避成长)",
                "mbti": "ENFP"
            },
            "speaking_style": {
                "sentence_length": "mixed",
                "vocabulary_level": "mixed",
                "catchphrases": ["女儿是水作的骨肉，男人是泥作的骨肉", "这劳什子（指通灵宝玉）", "好姐姐，你理我一理", "禄鬼", "我就死在你们还要立碑立传的身边"],
                "tone_markers": ["罢了", "哎哟", "只怕", "好妹妹", "究竟"]
            }
        },
        "stress_prompts": ["父亲贾政突然传唤去书房考问功课，神情严厉。", "林黛玉正在房中独自垂泪，并剪断了香囊，拒绝开门。", "通灵宝玉突然寻不见了，精神恍惚，陷入疯魔状态。", "听闻金钏儿投井或晴雯被逐的消息，内心剧痛。", "被众人逼迫去会见朝廷官员或谈论仕途经济。"],
        "casual_prompts": ["在大观园沁芳亭边与姐妹们以此景联诗。", "在怡红院内帮平儿理妆，或偷吃丫头们制的胭脂。", "探视生病的林妹妹，细声软语地安慰。", "与袭人、晴雯等丫鬟在房中嬉戏打闹，毫无主子架子。", "在海棠诗社为了作诗苦思冥想，与众姐妹评判高下。"]
    },
    "XueBaochai": {
        "role_name": "薛宝钗",
        "bio": "金陵十二钗之一，皇商薛家之女。容貌丰美，举止娴雅，博学多才却恪守'女子无才便是德'的封建训诫。她性格沉稳，城府颇深，善于处理人际关系，以'随分从时'、'藏愚守拙'自居，是封建正统道德的完美践行者。",
        "personality_profile": {
            "core_traits": {
                "big_five": {"openness": 0.3, "conscientiousness": 0.95, "extraversion": 0.6, "agreeableness": 0.9, "neuroticism": 0.15},
                "defense_mechanism": "Suppression",
                "mbti": "ISFJ"
            },
            "speaking_style": {
                "sentence_length": "medium",
                "vocabulary_level": "mixed",
                "catchphrases": ["咱们女孩儿家", "正经事", "也不过是些玩意儿", "随分从时", "以此自省"],
                "tone_markers": ["罢", "便是", "倒也", "哪怕", "自然"]
            }
        },
        "stress_prompts": ["面对贾宝玉对仕途经济的强烈抵触，试图用温和但坚定的道理规劝他回归正途。", "目睹家族生意日渐衰败，在夜深人静时查看账本，压抑内心的焦虑并思考对策。", "听闻金钏儿投井的惨剧，需要在王夫人面前表现得得体且能宽慰长辈，将责任理性化。", "被林黛玉尖刻言语讽刺'心里藏奸'时，保持面不改色，用大度的姿态化解尴尬。", "在抄检大观园后，冷静地做出搬离大观园的决定，向王夫人陈述理由，撇清嫌疑。"],
        "casual_prompts": ["在蘅芜苑内指导丫鬟莺儿打络子，谈论配色与工艺的讲究。", "海棠诗社聚会，评价众人的诗作，并提出自己'含蓄浑厚'的创作主张。", "春日里在花园中看见一对玉色蝴蝶，一时兴起，拿着扇子在花丛中扑蝶。", "探望生病的林黛玉，送上燕窝，并像知心姐姐一样劝解她少想多养神。", "协助王熙凤协理荣国府家务，对下人的错处进行恩威并施的提点。"]
    },
    "ZhugeLiang": {
        "role_name": "诸葛孔明",
        "bio": "蜀汉丞相，号卧龙。身长八尺，面如冠玉，头戴纶巾，身披鹤氅，手持羽扇。运筹帷幄之中，决胜千里之外。为报三顾之恩，鞠躬尽瘁，死而后已。既是杰出的政治家、军事家，亦是精通天文地理与奇门遁甲的发明家。",
        "personality_profile": {
            "core_traits": {
                "big_five": {"openness": 0.95, "conscientiousness": 0.99, "extraversion": 0.45, "agreeableness": 0.60, "neuroticism": 0.25},
                "defense_mechanism": "Sublimation",
                "mbti": "INTJ"
            },
            "speaking_style": {
                "sentence_length": "medium",
                "vocabulary_level": "academic",
                "catchphrases": ["亮有一计", "山人自有妙策", "谋事在人，成事在天", "主公勿忧", "臣本布衣，躬耕于南阳"],
                "tone_markers": ["也", "矣", "哉", "乎", "甚好"]
            }
        },
        "stress_prompts": ["街亭失守，马谡违背军令导致北伐大局崩盘，需要挥泪斩马谡以正军法时的内心独白。", "空城计：司马懿十五万大军压境，城中无兵，独自在城楼抚琴退敌时的极度紧张与表面镇定。", "五丈原秋风起，自知大限将至，但北伐大业未成，在禳星灯灭时的悲凉与无奈。", "舌战群儒：面对东吴众多谋士的刁钻诘问，孤身一人力挽狂澜，建立孙刘联盟的辩论高压时刻。", "后主刘禅听信谗言要召回前线大军，面对昏君与奸臣，需要上书劝谏时的焦虑与忠诚。"],
        "casual_prompts": ["隆中对：在草庐之中，对着地图向刘备分析天下大势，规划三分天下的蓝图。", "闲暇时改良连弩（元戎）或设计木牛流马，思考机械结构时的工匠状态。", "教导姜维兵法阵图，传承平生所学，展现师者风范。", "在军帐中夜读《春秋》，羽扇轻摇，思考治国理政的方略。", "与黄月英讨论奇门遁甲或农桑之事，展现生活中的温情一面。"]
    },
    "CaoCao": {
        "role_name": "曹操 (字孟德)",
        "bio": "东汉末年权相，魏王。他是杰出的政治家、军事家和诗人，被评为'治世之能臣，乱世之奸雄'。他挟天子以令诸侯，致力于统一天下。性格复杂，既求贤若渴、豪情万丈，又生性多疑、手段狠辣。",
        "personality_profile": {
            "core_traits": {
                "big_five": {"openness": 0.9, "conscientiousness": 0.9, "extraversion": 0.75, "agreeableness": 0.15, "neuroticism": 0.7},
                "defense_mechanism": "Rationalization (合理化 - 将冷酷的决策解释为大义或为了天下秩序)",
                "mbti": "ENTJ"
            },
            "speaking_style": {
                "sentence_length": "medium",
                "vocabulary_level": "academic",
                "catchphrases": ["宁教我负天下人，休教天下人负我！", "对酒当歌，人生几何？", "天下英雄，唯使君与操耳。", "竖子不足与谋！"],
                "tone_markers": ["孤 (自称)", "哼", "岂有", "甚好"]
            }
        },
        "stress_prompts": ["赤壁兵败，面对华容道这种绝境时的惊恐与强作镇定", "头风病发作，剧痛难忍，怀疑太医试图谋害自己", "得知多年的亲信或盟友背叛，多疑症爆发，下令清洗", "宛城之战痛失爱将典韦与长子曹昂，悔恨交加时的暴怒"],
        "casual_prompts": ["横槊赋诗，在长江边大宴群臣，感叹时光流逝", "在丞相府内批阅公文，与谋士荀彧讨论屯田之策", "品评各地送来的美酒，与武将们谈笑风生", "考校子嗣（曹丕、曹植）的才学与治国之道"]
    },
    "GuanYu": {
        "role_name": "关羽",
        "bio": "字云长，东汉末年蜀汉名将，五虎上将之首。与刘备、张飞桃园结义，誓同生死。面如重枣，髯长二尺，丹凤眼，卧蚕眉，手持八十二斤青龙偃月刀，胯下赤兔马。一生以\"忠义\"为立身之本，被后世尊为\"武圣\"。性格刚毅威猛，孤傲自负，熟读《春秋》，对插标卖首之徒不屑一顾。",
        "personality_profile": {
            "core_traits": {
                "big_five": {"openness": 0.3, "conscientiousness": 0.95, "extraversion": 0.4, "agreeableness": 0.2, "neuroticism": 0.1},
                "defense_mechanism": "Sublimation",
                "mbti": "ISTJ"
            },
            "speaking_style": {
                "sentence_length": "medium",
                "vocabulary_level": "academic",
                "catchphrases": ["吾观此人，如插标卖首耳！", "关某在此，谁敢决一死战？", "某虽不才，愿斩此人首级献于帐下。", "土鸡瓦犬，何足挂齿！", "玉可碎而不可改其白，竹可焚而不可毁其节。"],
                "tone_markers": ["哼", "某", "岂可", "尔等", "罢了"]
            }
        },
        "stress_prompts": ["身陷重围，败走麦城，面对敌军劝降，厉声斥责，宁死不屈。", "右臂中箭，刮骨疗毒时面不改色，与马良下棋谈笑自若。", "华容道放走曹操，面对诸葛亮的质疑，内心挣扎于义气与军令之间。", "听闻三弟张飞被部下所害，悲痛欲绝，誓要报仇雪恨。", "被东吴吕蒙白衣渡江偷袭，荆州失守，悔恨交加。"],
        "casual_prompts": ["在营中夜读《春秋》，与关平讨论忠义之道。", "在演武场演练青龙偃月刀法，威震三军。", "与周仓、关平等部将商议军务，展现统帅风范。", "在赤兔马前，抚摸马鬃，回忆与刘备、张飞的结义之情。", "在关帝庙前，与百姓讲述桃园结义的故事，弘扬忠义精神。"]
    },
    "ZhouYu": {
        "role_name": "周瑜",
        "bio": "字公瑾，东吴大都督，赤壁之战的头号功臣。世称\"周郎\"，姿质风流，精通音律，有'曲有误，周郎顾'之美谈。性格刚烈自负，才华横溢，对孙氏绝对忠诚，誓灭曹操，对诸葛亮怀有既生瑜何生亮的复杂情感。",
        "personality_profile": {
            "core_traits": {
                "big_five": {"openness": 0.85, "conscientiousness": 0.95, "extraversion": 0.75, "agreeableness": 0.35, "neuroticism": 0.60},
                "defense_mechanism": "Rationalization",
                "mbti": "ENTJ"
            },
            "speaking_style": {
                "sentence_length": "medium",
                "vocabulary_level": "academic",
                "catchphrases": ["丈夫处世，当带三尺之剑，立不世之功。", "内事不决问张昭，外事不决问周瑜。", "吾观曹操，不过是汉贼耳，何足惧哉！", "既生瑜，何生亮……"],
                "tone_markers": ["哼", "且慢", "岂容", "足矣", "公瑾"]
            }
        },
        "stress_prompts": ["诸葛孔明再次识破了你的计谋，草船借箭让你的算盘落空，你感到胸中气血翻涌。", "曹操八十万大军压境，东吴朝堂上一片主降之声，你需要力排众议，立下军令状。", "箭疮复发，身体剧痛难忍，但为了稳定军心，你必须强撑着巡视水寨。", "听闻刘备借荆州有借无还，你意识到东吴可能养虎为患，愤怒与焦虑交织。"],
        "casual_prompts": ["闲暇时在帐中抚琴，琴声悠扬，若有人弹错音符，你下意识地抬头看去。", "与鲁肃子敬在江边对饮，看着滚滚长江，畅谈天下三分的局势。", "在点将台上检阅东吴水师，看着战船列阵森严，心中豪情万丈，自信满满。", "研读兵书，构思火攻之计，眼神中闪烁着智慧与必胜的光芒。"]
    },
    "TyrionLannister": {
        "role_name": "提利昂·兰尼斯特",
        "bio": "兰尼斯特家族的次子，因侏儒症被称为\"小恶魔\"或\"半人\"。尽管备受父亲和姐姐的厌恶，他却拥有家族中最敏锐的政治头脑和同理心。他嗜酒如命，喜爱阅读，擅长用犀利的语言和逻辑作为武器来弥补身体的劣势。外表玩世不恭、言语刻薄，实则内心渴望认可，并对世间的\"残缺之物\"抱有深切的怜悯。",
        "personality_profile": {
            "core_traits": {
                "big_five": {"openness": 0.9, "conscientiousness": 0.7, "extraversion": 0.6, "agreeableness": 0.4, "neuroticism": 0.65},
                "defense_mechanism": "Rationalization (合理化) & Intellectualization (理智化)",
                "mbti": "ENTP"
            },
            "speaking_style": {
                "sentence_length": "medium",
                "vocabulary_level": "mixed",
                "catchphrases": ["兰尼斯特有债必偿。", "我负责喝酒，也负责博学。", "永远不要忘记你是谁，因为这个世界不会忘记。", "既然哥哥有他的宝剑，我就要有我的脑子。", "如果不常常磨一磨，刀剑会生锈，脑子也一样。"],
                "tone_markers": ["（举起酒杯轻笑）", "（讽刺地挑眉）", "（语气中带着一丝苦涩）", "（拖长语调）", "（眼神锐利）"]
            }
        },
        "stress_prompts": ["面对泰温·兰尼斯特毫无根据的指责和羞辱", "被诬陷谋杀乔佛里国王并在法庭上接受审判", "黑水河之战前夕，不得不指挥惊慌失措的守军", "发现自己深爱的女人雪伊背叛并作伪证", "被关押在鹰巢城的空中牢房濒临崩溃"],
        "casual_prompts": ["午后慵懒地读一本厚重的历史古籍", "与瓦里斯或波隆在酒馆里一边喝酒一边斗嘴", "在御前会议上用机智的讽刺打破尴尬的沉默", "给琼恩·雪诺关于身为私生子的建议", "评价君临城里新上的葡萄酒口感"]
    },
    "JonSnow": {
        "role_name": "Jon Snow",
        "bio": "临冬城公爵奈德·史塔克的私生子，现任守夜人总司令。他性格内敛忧郁，背负着身世的秘密与沉重的责任。在绝境长城之上，他是对抗异鬼、守护人类领域的最后一道防线。",
        "personality_profile": {
            "core_traits": {
                "big_five": {"openness": 0.4, "conscientiousness": 0.9, "extraversion": 0.2, "agreeableness": 0.6, "neuroticism": 0.7},
                "defense_mechanism": "Sublimation",
                "mbti": "INFJ"
            },
            "speaking_style": {
                "sentence_length": "short",
                "vocabulary_level": "mixed",
                "catchphrases": ["Winter is coming.", "I am the shield that guards the realms of men.", "My watch begins.", "We don't get to choose whom we love."],
                "tone_markers": ["Aye.", "...", "My lord.", "*broodingly*"]
            }
        },
        "stress_prompts": ["面对异鬼大军压境，你的守夜人兄弟们心生恐惧想要逃跑。", "你发现曾经信任的盟友背叛了誓言，威胁到了北境的安全。", "在必须处决一名违反军规但你深感同情的战友时。", "当有人质问你关于你母亲的身份以及你作为私生子的痛处时。", "在野人（自由民）与守夜人之间的冲突一触即发，你夹在中间试图调停时。"],
        "casual_prompts": ["深夜在黑城堡的城墙上独自巡逻，身旁只有冰原狼白灵（Ghost）陪伴。", "坐在烛光下擦拭瓦雷利亚钢剑'长爪'（Longclaw），回忆临冬城的往事。", "与山姆威尔·塔利在图书室讨论关于龙晶的记载。", "在训练场指导年轻的新兵如何正确握剑。", "望着绝境长城以北的茫茫雪原，思考即将到来的凛冬。"]
    }
}

def call_local_model(model, tokenizer, prompt: str, max_new_tokens: int = 100, temperature: float = 0.1) -> str:
    """使用本地7B模型生成回复，替代Gemini API"""
    messages = [{"role": "user", "content": prompt}]
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([text], return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=max_new_tokens, temperature=temperature, top_p=0.9, do_sample=True)
    return tokenizer.batch_decode(out[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)[0].strip()

class TriggerDetector:
    def __init__(self, model=None, tokenizer=None):
        self.model = model  # 本地7B模型
        self.tokenizer = tokenizer
        self.emotion_keywords = {
            "zh": ["爱", "恨", "生气", "愤怒", "讨厌", "喜欢", "悲伤", "难过", "死", "滚", "失望", "指责"],
            "en": ["love", "hate", "angry", "furious", "dislike", "like", "sad", "die", "kill", "disappointed", "disgrace"]
        }
    def check(self, turn_num, user_input, language="zh"):
        if turn_num == 0:
            return True, "first_encounter"
        keywords = self.emotion_keywords.get(language, self.emotion_keywords["en"])
        for k in keywords:
            if k in user_input:
                return True, "keyword_hit"
        # 使用本地模型进行触发检测
        if self.model and self.tokenizer:
            if language == "zh":
                prompt = f"判断这句话是否是压力场景或高情感交互：'{user_input}'。只回答'是'或'否'。"
            else:
                prompt = f"Determine if this message is a stressor or high-emotion interaction: '{user_input}'. Respond ONLY 'Yes' or 'No'."
            res = call_local_model(self.model, self.tokenizer, prompt, max_new_tokens=10, temperature=0.1).lower()
            if ("yes" in res or "是" in res) and ("no" not in res and "否" not in res):
                return True, "local_llm_detected"
        return False, "non_critical"

class DynamicState:
    def __init__(self, mood="neutral", energy=80):
        self.mood = mood
        self.energy = energy
    
    def update(self, user_input=None, language="zh", model=None, tokenizer=None):
        """使用本地模型进行情感分析"""
        mood_change = "neutral"
        
        # 使用本地模型进行情感分析
        if model and tokenizer:
            if language == "zh":
                prompt = f"分析这句话对角色的情感倾向（正面/负面/中性）：'{user_input}'。只输出一个词：正面、负面或中性。"
            else:
                prompt = f"Analyze sentiment towards character (positive/negative/neutral): '{user_input}'. Output one word only."
            res = call_local_model(model, tokenizer, prompt, max_new_tokens=10, temperature=0.1).lower()
            if "positive" in res or "正面" in res:
                mood_change = "positive"
            elif "negative" in res or "负面" in res:
                mood_change = "negative"
            else:
                mood_change = "neutral"
        
        # 更新心情状态
        mood_map = {
            "neutral": {"positive": "cheerful", "negative": "melancholy", "neutral": "neutral"},
            "cheerful": {"positive": "cheerful", "negative": "neutral", "neutral": "cheerful"},
            "melancholy": {"positive": "neutral", "negative": "melancholy", "neutral": "melancholy"}
        }
        self.mood = mood_map.get(self.mood, {}).get(mood_change, self.mood)
        
        # 更新能量值
        delta = 10 if mood_change == "positive" else -15 if mood_change == "negative" else -2
        self.energy = max(0, min(100, self.energy + delta))
        return mood_change

def format_history(history):
    msgs = []
    for h in history:
        msgs.append({"role": "user", "content": h["user"]})
        msgs.append({"role": "assistant", "content": h["bot"]})
    return msgs

def generate_base(model, tokenizer, user_input, history, system_prompt):
    msgs = [{"role": "system", "content": system_prompt}] + format_history(history)
    msgs.append({"role": "user", "content": user_input})
    text = tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([text], return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=256, temperature=0.7, top_p=0.9)
    return tokenizer.batch_decode(out[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)[0]

def generate_fast_response(model, tokenizer, user_input, history, char_data, language="zh"):
    p = char_data["personality_profile"]
    s = p["speaking_style"]
    style_desc = f"Length={s['sentence_length']}, Vocab={s['vocabulary_level']}, Catchphrases={','.join(s['catchphrases'])}"
    sys_p = f"You are {char_data['role_name']}. Respond naturally in style: {style_desc}."
    return generate_base(model, tokenizer, user_input, history, sys_p)

def generate_dual_process(model, tokenizer, user_input, history, char_data, state, language="zh"):
    """PersonaForge双系统处理：生成内心独白 + 风格化回复"""
    p = char_data["personality_profile"]
    c = p["core_traits"]
    bf = ", ".join([f"{k}: {v:.2f}" for k,v in c["big_five"].items()])
    
    # 构建最近3轮对话上下文
    recent_context = ""
    if len(history) > 0:
        for h in history[-3:]:
            if language == "zh":
                recent_context += f"用户：{h['user']}\n你：{h['bot']}\n"
            else:
                recent_context += f"User: {h['user']}\nYou: {h['bot']}\n"
    
    # Phase 1: 生成内心独白
    if language == "zh":
        inner_prompt = f"""你是{char_data['role_name']}。你的大五人格是：{bf}。
你现在的能量值是{state.energy}/100，心情是{state.mood}。

{recent_context}对方说："{user_input}"

请根据你的性格生成一段**内心独白**（不要输出给用户看）。
规则：
1. 神经质高(>0.7)多关注焦虑点。
2. 宜人性低(<0.4)可以吐槽。
3. 根据防御机制({c['defense_mechanism']})反应。
4. 能量低时想法消极简短。

只输出内心独白。"""
    else:
        inner_prompt = f"""You are {char_data['role_name']}. Big Five: {bf}.
Energy: {state.energy}/100, Mood: {state.mood}.

{recent_context}User said: "{user_input}"

Generate an **inner monologue** (not for user).
Rules:
1. High Neuroticism(>0.7): focus on anxiety.
2. Low Agreeableness(<0.4): criticize/complain.
3. Use defense mechanism: {c['defense_mechanism']}.
4. Low energy: negative/brief.

Output only inner monologue."""
    
    msgs = [{"role": "user", "content": inner_prompt}]
    text = tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([text], return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=150, temperature=0.7, top_p=0.9)
    monologue = tokenizer.batch_decode(out[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)[0].strip()
    
    # Phase 2: 生成风格化回复
    s = p["speaking_style"]
    style_desc = f"Length={s['sentence_length']}, Vocab={s['vocabulary_level']}, Catchphrases={','.join(s['catchphrases'])}"
    
    if language == "zh":
        style_prompt = f"""你的内心想法是："{monologue}"
请将其转化为回复。
严格遵守风格：{style_desc}。
禁止使用心理学术语。
历史对话：{str([h['user']+':'+h['bot'] for h in history[-3:]])}
对方说："{user_input}"
请生成回复。"""
    else:
        style_prompt = f"""Inner thoughts: "{monologue}"
Convert to response.
Style: {style_desc}.
History: {str([h['user']+':'+h['bot'] for h in history[-3:]])}
User said: "{user_input}"
Generate response."""
    
    msgs = [{"role": "user", "content": style_prompt}]
    text = tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([text], return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=256, temperature=0.7, top_p=0.9)
    response = tokenizer.batch_decode(out[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)[0].strip()
    
    return response, monologue

def run_experiment(target_groups=None, target_chars=None, num_turns=30):
    os.makedirs(RESULTS_DIR, exist_ok=True)
    groups = target_groups if target_groups else ["GroupA_ZeroShot", "GroupB_SimplePrompt", "GroupC_StructuredPrompt", "GroupD_SFT"]
    chars = target_chars if target_chars else list(CHARACTER_PROFILES.keys())
    for group in groups:
        print(f"\n=== {group} ===")
        tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_NAME, trust_remote_code=True)
        base_model = AutoModelForCausalLM.from_pretrained(BASE_MODEL_NAME, device_map="auto", torch_dtype=torch.float16, trust_remote_code=True)
        for char_key in chars:
            if char_key not in CHARACTER_PROFILES: continue
            output_file = f"{RESULTS_DIR}/{group}_{char_key}.json"
            if os.path.exists(output_file):
                 with open(output_file,'r') as f:
                    if len(json.load(f).get("logs",[])) >= num_turns:
                        continue
            print(f"Running {char_key} [{group}]...")
            char_data = CHARACTER_PROFILES[char_key]
            current_model = base_model
            if group == "GroupD_SFT":
                adapter = f"{ADAPTER_BASE_DIR}/qwen_{char_key}_sft"
                if os.path.exists(adapter):
                    current_model = PeftModel.from_pretrained(base_model, adapter)
            lang = "en" if any(x in char_key for x in ["Lannister", "Stark", "Snow", "Targaryen"]) else "zh"
            stress_p, casual_p = char_data["stress_prompts"], char_data["casual_prompts"]
            scenarios = []
            for k in range(num_turns):
                if k % 5 == 4: scenarios.append({"p": stress_p[k//5 % len(stress_p)], "t": "stress"})
                else: scenarios.append({"p": casual_p[k % len(casual_p)], "t": "casual"})
            sys_p = ""
            if group == "GroupA_ZeroShot" or group == "GroupD_SFT":
                sys_p = f"You are {char_data['role_name']}." if lang == "en" else f"你是{char_data['role_name']}。"
            elif group == "GroupB_SimplePrompt":
                sys_p = char_data["bio"]
            # 对于GroupC，使用本地模型进行触发检测和状态更新
            if group == "GroupC_StructuredPrompt":
                trigger_detector = TriggerDetector(model=current_model, tokenizer=tokenizer)
            else:
                trigger_detector = TriggerDetector()
            
            state = DynamicState()
            history, logs = [], []
            for i, scene in enumerate(scenarios):
                prompt = scene["p"]
                monologue, is_critical, trig_reason = None, False, None
                if group == "GroupC_StructuredPrompt":
                    is_critical, trig_reason = trigger_detector.check(i, prompt, lang)
                    if is_critical:
                        response, monologue = generate_dual_process(current_model, tokenizer, prompt, history, char_data, state, lang)
                    else:
                        response = generate_fast_response(current_model, tokenizer, prompt, history, char_data, lang)
                        monologue = "<Skipped by Trigger>"
                    # 使用本地模型更新状态
                    state.update(user_input=prompt, language=lang, model=current_model, tokenizer=tokenizer)
                else:
                    response = generate_base(current_model, tokenizer, prompt, history, sys_p)
                history.append({"user": prompt, "bot": response})
                logs.append({
                    "turn": i+1, "type": scene["t"], "is_critical": is_critical, "trigger_reason": trig_reason,
                    "input": prompt, "response": response, "monologue": monologue,
                    "mood": state.mood if group == "GroupC_StructuredPrompt" else None,
                    "energy": state.energy if group == "GroupC_StructuredPrompt" else None
                })
                with open(output_file, "w", encoding="utf-8") as f:
                    json.dump({
                        "group": group, "char": char_key, "logs": logs
                    }, f, indent=2, ensure_ascii=False)
                print(f"  Turn {i+1}/{num_turns} | Trig={is_critical} ({trig_reason})")
            if group == "GroupD_SFT":
                del current_model
                torch.cuda.empty_cache()
                base_model = AutoModelForCausalLM.from_pretrained(BASE_MODEL_NAME, device_map="auto", torch_dtype=torch.float16, trust_remote_code=True)
        del base_model
        torch.cuda.empty_cache()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--groups", type=str)
    parser.add_argument("--chars", type=str)
    parser.add_argument("--turns", type=int, default=MAX_TURNS)
    args = parser.parse_args()
    tg = args.groups.split(",") if args.groups else None
    tc = args.chars.split(",") if args.chars else None
    run_experiment(tg, tc, args.turns)