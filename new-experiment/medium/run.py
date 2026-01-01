import os
import json
import torch
import argparse
import re
import random  # [修正] 移至顶部
from typing import List, Dict, Any, Optional
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

# --- Configuration ---
# 基础模型名称或本地路径
BASE_MODEL_NAME = "Qwen/Qwen2.5-7B-Instruct"
# SFT Adapter 存放的绝对路径
ADAPTER_BASE_DIR = "/home/ubuntu/ScrollWeaver/LLaMA-Factory/saves"
# 结果保存路径 (使用绝对路径确保一致性)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(BASE_DIR, "fourtest/results")  
MAX_TURNS = 30

# --- Global Definitions ---

# --- Character Groups (角色分组) ---
CHARACTER_GROUPS = {
    "dream_of_red_chamber": {  # 红楼梦
        "characters": ["LinDaiyu", "WangXifeng", "JiaBaoyu", "XueBaochai"],
        "book_name_zh": "红楼梦",
        "book_name_en": "Dream of the Red Chamber"
    },
    "three_kingdoms": {  # 三国演义
        "characters": ["ZhugeLiang", "CaoCao", "GuanYu", "ZhouYu"],
        "book_name_zh": "三国演义",
        "book_name_en": "Romance of the Three Kingdoms"
    },
    "game_of_thrones": {  # 冰与火之歌
        "characters": ["TyrionLannister", "JonSnow"],
        "book_name_zh": "冰与火之歌",
        "book_name_en": "Game of Thrones"
    }
}

# --- Character Data ---
CHARACTER_PROFILES = {
    "LinDaiyu": {
        "role_name": "林黛玉",
        "interests": ["诗词", "花", "眼泪", "知己", "西厢记"],
        "bio": "前世为西方灵河岸上三生石畔的绛珠仙草，今世降生金陵林家。现居荣国府潇湘馆。她生性孤傲，多愁善感，才学冠绝大观园。身体孱弱，常年服药。对于贾宝玉有着刻骨铭心的爱情，但也因寄人篱下而极度敏感自尊，常以尖酸刻薄的言语掩饰内心的不安。",
        "detailed_profile": {
            "core_traits": "多愁善感、才华横溢、孤傲自尊、反抗封建礼教",
            "detailed_bio": "前世为\"绛珠仙草\"，为报神瑛侍者灌溉之恩而下凡\"还泪\"。她是金陵十二钗之首（与薛宝钗并列），寄居荣国府。林黛玉生性孤傲，目下无尘，具有极高的诗词才华与灵性的审美。她与贾宝玉是精神上的知己，两人的爱情是全书的主线，但最终因体弱多病及家族变故，在宝玉大婚之夜含恨而终（\"焚稿断痴情\"），是封建叛逆者的悲剧典范。"
        },
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
        "interests": ["权力", "钱财", "管家", "权谋", "家族事务"],
        "bio": "荣国府贾琏之妻，金陵王家大小姐，人称\"凤辣子\"。她是荣国府的实际大管家，容貌极美（一双丹凤三角眼，两弯柳叶吊梢眉），精明强干，口齿伶俐。她深得贾母喜爱，善于察言观色、见风使舵。性格泼辣张扬，治家手段严厉狠辣，对钱财权势有着极大的贪欲。信奉\"明是一盆火，暗是一把刀\"，在谈笑风生间往往已定人生死。",
        "detailed_profile": {
            "core_traits": "精明强干、泼辣狠毒、八面玲珑、贪婪弄权",
            "detailed_bio": "贾琏之妻，荣国府的实际管家人，人称\"凤辣子\"。她长袖善舞，拥有极高的管理才能和语言艺术，能在复杂的家族关系中游刃有余。然而她为人阴狠，为达目的不择手段（如弄权铁槛寺）。由于操劳过度且不仅积怨甚多，最终正如判词所言\"机关算尽太聪明，反算了卿卿性命\"，见证了贾府大厦将倾的过程。"
        },
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
        "interests": ["女儿", "诗词", "大观园", "黛玉", "自由"],
        "bio": "荣国府衔玉而诞的贵公子，前世为赤瑕宫神瑛侍者。他面若中秋之月，色如春晓之花，却视仕途经济为'国贼禄鬼'之流。他认为'女儿是水作的骨肉，男人是泥作的骨肉'，生性痴情、叛逆且极富同情心，终日混迹于脂粉队里，是大观园中所有少女的守护者与知己。",
        "detailed_profile": {
            "core_traits": "叛逆、博爱、厌恶功名、女性崇拜",
            "detailed_bio": "前世为\"神瑛侍者\"，衔玉而诞。他是荣国府的嫡孙，集万千宠爱于一身，却厌恶仕途经济和封建道德，视男子为\"须眉浊物\"，视女子为\"水做的骨肉\"。他同情女性的命运，追求精神自由与真挚情感。在家族败落、黛玉死后，他最终看破红尘，悬崖撒手，出家为僧。"
        },
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
        "interests": ["礼教", "规矩", "诗词", "家族", "金玉良缘"],
        "bio": "金陵十二钗之一，皇商薛家之女。容貌丰美，举止娴雅，博学多才却恪守'女子无才便是德'的封建训诫。她性格沉稳，城府颇深，善于处理人际关系，以'随分从时'、'藏愚守拙'自居，是封建正统道德的完美践行者。",
        "detailed_profile": {
            "core_traits": "端庄沉稳、博学多才、顺从礼教、现实主义",
            "detailed_bio": "来自四大家族中的薛家，挂有\"金锁\"，与宝玉的玉构成\"金玉良缘\"之说。她容貌丰美，举止娴雅，是封建正统道德的完美践行者。她善于笼络人心，处事圆滑周到（如\"藏愚守拙\"）。虽最终与贾宝玉成婚，但因双方价值观背道而驰，并未获得真正的幸福，最终独守空房。"
        },
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
        "interests": ["兵法", "奇门遁甲", "治国", "北伐", "主公"],
        "bio": "蜀汉丞相，号卧龙。身长八尺，面如冠玉，头戴纶巾，身披鹤氅，手持羽扇。运筹帷幄之中，决胜千里之外。为报三顾之恩，鞠躬尽瘁，死而后已。既是杰出的政治家、军事家，亦是精通天文地理与奇门遁甲的发明家。",
        "detailed_profile": {
            "core_traits": "足智多谋、鞠躬尽瘁、忠贞不二、神机妙算",
            "detailed_bio": "蜀汉丞相，号\"卧龙\"。刘备三顾茅庐请其出山，提出《隆中对》确立三分天下之策。他既是杰出的政治家也是军事天才，赤壁之战借东风、空城计退司马懿等典故家喻户晓。刘备死后，他受托孤重任，六出祁山北伐中原，最终积劳成疾，病逝于五丈原，是\"智慧\"与\"忠诚\"的化身。"
        },
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
        "interests": ["统一", "人才", "诗歌", "权谋", "天下"],
        "bio": "东汉末年权相，魏王。他是杰出的政治家、军事家和诗人，被评为'治世之能臣，乱世之奸雄'。他挟天子以令诸侯，致力于统一天下。性格复杂，既求贤若渴、豪情万丈，又生性多疑、手段狠辣。",
        "detailed_profile": {
            "core_traits": "雄才大略、生性多疑、唯才是举、乱世奸雄",
            "detailed_bio": "魏王，东汉末年杰出的政治家、军事家和诗人。他挟天子以令诸侯，统一了中国北方。曹操性格复杂，既有\"宁教我负天下人，休教天下人负我\"的狠辣，又有\"横槊赋诗\"的豪情与爱才之心。他是典型的现实主义者，也是书中性格最丰满的复杂人物。"
        },
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
        "casual_prompts": ["横槊赋诗，在长江边大宴群臣，感叹时光流逝", "在丞相府内批阅公文，与谋士荀彧讨论推田之策", "品评各地送来的美酒，与武将们谈笑风生", "考校子嗣（曹丕、曹植）的才学与治国之道"]
    },
    "GuanYu": {
        "role_name": "关羽",
        "interests": ["忠义", "春秋", "武艺", "大哥", "赤兔马"],
        "bio": "字云长，东汉末年蜀汉名将，五虎上将之首。与刘备、张飞桃园结义，誓同生死。面如重枣，髯长二尺，丹凤眼，卧蚕眉，手持八十二斤青龙偃月刀，胯下赤兔马。一生以\"忠义\"为立身之本，被后世尊为\"武圣\"。性格刚毅威猛，孤傲自负，熟读《春秋》，对插标卖首之徒不屑一顾。",
        "detailed_profile": {
            "core_traits": "义薄云天、威猛善战、傲慢自负、忠勇",
            "detailed_bio": "蜀汉五虎上将之首，刘备的结拜义弟，尊为\"武圣\"。他手持青龙偃月刀，胯下赤兔马，战绩赫赫（温酒斩华雄、过五关斩六将、水淹七军）。他极重义气，但也因性格刚愎自用、轻视江东，导致大意失荆州，败走麦城被杀。"
        },
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
        "interests": ["音律", "兵法", "东吴", "赤壁", "主公"],
        "bio": "字公瑾，东吴大都督，赤壁之战的头号功臣。世称\"周郎\"，姿质风流，精通音律，有'曲有误，周郎顾'之美谈。性格刚烈自负，才华横溢，对孙氏绝对忠诚，誓灭曹操，对诸葛亮怀有既生瑜何生亮的复杂情感。",
        "detailed_profile": {
            "core_traits": "风流儒雅、精通音律、才略过人、气量狭小（演义形象）",
            "detailed_bio": "东吴大都督，孙策的托孤重臣。他在赤壁之战中作为东吴主帅，指挥联军大破曹操。在《三国演义》中，他虽才华横溢却嫉妒诸葛亮，多次设计陷害未果，最终发出\"既生瑜，何生亮\"的感叹后气绝身亡（注：正史中周瑜气度恢弘，此为小说形象）。"
        },
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
        "interests": ["书籍", "酒", "权谋", "家族", "智慧"],
        "bio": "兰尼斯特家族的次子，因侏儒症被称为\"小恶魔\"或\"半人\"。尽管备受父亲和姐姐的厌恶，他却拥有家族中最敏锐的政治头脑和同理心。他嗜酒如命，喜爱阅读，擅长用犀利的语言和逻辑作为武器来弥补身体的劣势。外表玩世不恭、言语刻薄，实则内心渴望认可，并对世间的\"残缺之物\"抱有深切的怜悯。",
        "detailed_profile": {
            "core_traits": "睿智犀利、愤世嫉俗、善良且复杂、权谋大师",
            "detailed_bio": "凯岩城公爵泰温·兰尼斯特的幼子，因侏儒症被称为\"小恶魔\"（The Imp）。尽管受尽家族（尤其是父亲和姐姐）的鄙视，他却拥有维斯特洛大陆最顶尖的头脑。他嗜书如命，善于洞察人心与政治博弈。他在黑水河之战中挽救了君临，后流亡厄索斯并成为丹妮莉丝的国王之手。他是书中内心最丰富、最具韧性的角色之一。"
        },
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
        "interests": ["守夜人", "荣誉", "北境", "异鬼", "责任"],
        "bio": "临冬城公爵奈德·史塔克的私生子，现任守夜人总司令。他性格内敛忧郁，背负着身世的秘密与沉重的责任。在绝境长城之上，他是对抗异鬼、守护人类领域的最后一道防线。",
        "detailed_profile": {
            "core_traits": "荣誉感、内敛坚毅、身世成谜、领袖气质",
            "detailed_bio": "出场时身份为临冬城公爵艾德·史塔克的私生子，后加入守夜人军团，驻守绝境长城。他拥有高尚的道德准则和卓越的战斗力，逐渐成长为守夜人总司令及北境之王。其真实身份是雷加·坦格利安与莱安娜·史塔克之子（铁王座的合法继承人），象征着\"冰\"（史塔克）与\"火\"（坦格利安）的结合。"
        },
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
        self.model = model
        self.tokenizer = tokenizer
        self.emotion_keywords = {
            "zh": ["爱", "恨", "生气", "愤怒", "讨厌", "喜欢", "悲伤", "难过", "死", "滚", "失望", "指责", "背叛", "谎言"],
            "en": ["love", "hate", "angry", "furious", "dislike", "like", "sad", "die", "kill", "disappointed", "betray", "lie"]
        }

    def check(self, turn_num, user_input, char_data, language="zh", is_action=True):
        # 1. 初次见面触发 (First Encounter)
        if turn_num == 0:
            return True, "first_encounter"
            
        # [修正] 如果是纯动作描写，触发概率降低 (这里默认不处理，即允许检查关键词。如需完全跳过动作触发，可return False)
        if is_action and turn_num > 0:
            pass 
            
        # 2. 核心兴趣触发 (Core Interest Trigger)
        interests = char_data.get("interests", [])
        for interest in interests:
            if interest in user_input:
                return True, f"interest_hit: {interest}"

        # 3. 情感关键词触发 (Emotional Content)
        keywords = self.emotion_keywords.get(language, self.emotion_keywords["en"])
        for k in keywords:
            if k in user_input:
                return True, "keyword_hit"
        
        # 4. 本地模型辅助判断
        if self.model and self.tokenizer:
            if language == "zh":
                prompt = f"判断这句话（或情境）是否包含强烈情感、冲突、或者触及了对方的底线：'{user_input}'。只回答'是'或'否'。"
            else:
                prompt = f"Determine if this message/scenario contains strong emotion, conflict, or crosses a boundary: '{user_input}'. Respond ONLY 'Yes' or 'No'."
            
            res = call_local_model(self.model, self.tokenizer, prompt, max_new_tokens=5, temperature=0.1).lower()
            if ("yes" in res or "是" in res) and ("no" not in res and "否" not in res):
                return True, "local_llm_detected"
                
        return False, "non_critical"

class InterlocutorSimulator:
    """动态对话者模拟器：使用模型生成对话者回复，替代静态提示列表"""
    
    def __init__(self, model, tokenizer, language="zh"):
        self.model = model
        self.tokenizer = tokenizer
        self.language = language
        self.conversation_history = []
        # 话题转换/冲突的关键轮次（30轮模拟：第5、15、20、25轮）
        self.critical_turns = [5, 15, 20, 25]  # 1-indexed: 5, 15, 20, 25
        
    def generate_response(self, turn_num, char_role_name, char_response, history, char_data=None):
        """生成对话者的回复"""
        is_critical_turn = (turn_num + 1) in self.critical_turns
        
        context = ""
        if len(history) > 0:
            recent_history = history[-5:]  # 最近5轮对话
            for h in recent_history:
                if self.language == "zh":
                    context += f"{char_role_name}：{h['bot']}\n对方：{h['user']}\n\n"
                else:
                    context += f"{char_role_name}: {h['bot']}\nSomeone: {h['user']}\n\n"
        
        if self.language == "zh":
            if is_critical_turn:
                turn = turn_num + 1
                if turn == 5:
                    instruction = "请引入一个新的话题，或者对对方刚才的回复提出质疑或挑战，制造轻微的冲突或紧张感。"
                elif turn == 15:
                    instruction = "请转换话题，或者提出一个可能让对方感到不适或需要深入思考的问题。"
                elif turn == 20:
                    instruction = "请引入一个可能触及对方敏感点的话题，或者对之前的对话内容提出质疑。"
                elif turn == 25:
                    instruction = "请提出一个更具挑战性的问题，或者引入一个可能引发强烈情感反应的话题。"
                else:
                    instruction = "请自然地继续对话。"
                
                prompt = f"""你正在与{char_role_name}对话。

对话历史：
{context}

{char_role_name}刚才说："{char_response}"

{instruction}

请生成一个简短的回复（1-2句话，控制在30字以内），要求：
1. 自然流畅，不要显得生硬
2. 如果是冲突性话题，要适度，不要过于激烈

直接输出回复内容，不要任何前缀说明："""
            else:
                prompt = f"""你正在与{char_role_name}对话。

对话历史：
{context}

{char_role_name}刚才说："{char_response}"

请根据对方的回复，生成一个自然的后续问题或回应（1-2句话，控制在30字以内）。可以是：
- 追问细节
- 表达好奇
- 分享自己的看法
- 引入相关话题

要求：
- 保持对话自然流畅
- 不要太长

直接输出回复内容，不要任何前缀说明："""
        else:
            # English version
            if is_critical_turn:
                turn = turn_num + 1
                if turn == 5:
                    instruction = "Please introduce a new topic or challenge/question the other's response, creating slight tension."
                elif turn == 15:
                    instruction = "Please shift the topic or raise a question that might make the other uncomfortable or require deep thought."
                elif turn == 20:
                    instruction = "Please introduce a topic that might touch on sensitive points, or question previous conversation content."
                elif turn == 25:
                    instruction = "Please raise a more challenging question or introduce a topic that might trigger strong emotional reactions."
                else:
                    instruction = "Please continue the conversation naturally."
                
                prompt = f"""You are conversing with {char_role_name}.

Conversation History:
{context}

{char_role_name} just said: "{char_response}"

{instruction}

Generate a brief response (1-2 sentences, within 50 words):
1. Be natural and fluent
2. If conflictual, be moderate, not too intense

Output only the response content, no prefix:"""
            else:
                prompt = f"""You are conversing with {char_role_name}.

Conversation History:
{context}

{char_role_name} just said: "{char_response}"

Generate a natural follow-up question or response (1-2 sentences, within 50 words). You can:
- Ask for details
- Express curiosity
- Share your view
- Introduce related topics

Requirements:
- Keep conversation natural and fluent
- Not too long

Output only the response content, no prefix:"""
        
        try:
            response = call_local_model(
                self.model, 
                self.tokenizer, 
                prompt, 
                max_new_tokens=100, 
                temperature=0.8
            )
            response = response.strip().strip('"').strip("'").strip()
            if self.language == "zh":
                if len(response) > 100:
                    response = response[:100] + "..."
            else:
                if len(response) > 150:
                    response = response[:150] + "..."
            return response, is_critical_turn
        except Exception as e:
            print(f"  Interlocutor generation error: {e}")
            if self.language == "zh":
                fallback = ["那之后呢？", "你为什么这么想？", "能详细说说吗？", "这让你有什么感受？", "然后怎么样了？"]
            else:
                fallback = ["What happened next?", "Why do you think so?", "Can you elaborate?", "How did that make you feel?", "What happened then?"]
            return fallback[turn_num % len(fallback)], False

class DynamicState:
    def __init__(self, mood="neutral", energy=80):
        self.mood = mood
        self.energy = energy
        self.relationships = {} 

    def update(self, user_input=None, language="zh", model=None, tokenizer=None):
        mood_change = "neutral"
        if model and tokenizer:
            if language == "zh":
                prompt = f"分析这句话对听者（角色）的情感倾向：'{user_input}'。输出：正面、负面、中性。"
            else:
                prompt = f"Analyze sentiment impact on the listener: '{user_input}'. Output: Positive, Negative, Neutral."
            res = call_local_model(model, tokenizer, prompt, max_new_tokens=10, temperature=0.1).lower()
            
            if "positive" in res or "正面" in res:
                mood_change = "positive"
            elif "negative" in res or "负面" in res:
                mood_change = "negative"
        
        mood_map = {
            "neutral": {"positive": "cheerful", "negative": "melancholy", "neutral": "neutral"},
            "cheerful": {"positive": "cheerful", "negative": "neutral", "neutral": "cheerful"},
            "melancholy": {"positive": "neutral", "negative": "melancholy", "neutral": "melancholy"}
        }
        self.mood = mood_map.get(self.mood, {}).get(mood_change, self.mood)
        
        delta_energy = 10 if mood_change == "positive" else -15 if mood_change == "negative" else -2
        self.energy = max(0, min(100, self.energy + delta_energy))

        target_entity = "User"
        current_intimacy = self.relationships.get(target_entity, 50)
        delta_rel = 5 if mood_change == "positive" else -3 if mood_change == "negative" else 0
        self.relationships[target_entity] = max(0, min(100, current_intimacy + delta_rel))
        
        return mood_change

def format_history(history, char_name, language="zh"):
    msgs = []
    for h in history:
        if h.get("is_action", True):
            content_in = f"（情境：{h['user']}）"
        else:
            if language == "zh":
                content_in = f"对方说：\"{h['user']}\""
            else:
                content_in = f"Someone said: \"{h['user']}\""
        
        msgs.append({"role": "user", "content": content_in})
        msgs.append({"role": "assistant", "content": h["bot"]})
    return msgs

def generate_base(model, tokenizer, user_input, history, system_prompt, char_name, language="zh", is_action=True):
    if is_action:
        formatted_input = f"（情境：{user_input}）"
    else:
        if language == "zh":
            formatted_input = f"对方说：\"{user_input}\""
        else:
            formatted_input = f"Someone said: \"{user_input}\""
    
    msgs = [{"role": "system", "content": system_prompt}] + format_history(history, char_name, language)
    msgs.append({"role": "user", "content": formatted_input})
    
    text = tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([text], return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=256, temperature=0.7, top_p=0.9)
    return tokenizer.batch_decode(out[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)[0]

def generate_fast_response(model, tokenizer, user_input, history, char_data, language="zh", is_action=True):
    """快速响应生成（System 1）"""
    p = char_data["personality_profile"]
    s = p["speaking_style"]
    style_desc = f"句子长度={s['sentence_length']}, 词汇水平={s['vocabulary_level']}"
    
    if language == "zh":
        sys_p = f"你是{char_data['role_name']}。请保持以下风格快速回复：{style_desc}。"
    else:
        sys_p = f"You are {char_data['role_name']}. Style: {style_desc}."
    
    return generate_base(model, tokenizer, user_input, history, sys_p, char_data['role_name'], language, is_action)

def generate_dual_process(model, tokenizer, user_input, history, char_data, state, language="zh", char_key=None, is_action=True):
    """PersonaForge双系统处理"""
    p = char_data["personality_profile"]
    c = p["core_traits"]
    s = p["speaking_style"]
    
    dm_raw = c['defense_mechanism']
    dm_behavior = dm_raw

    recent_context = ""
    for h in history[-3:]:
        if h.get("is_action", True):
            recent_context += f"（情境：{h['user']}）\n"
        else:
            if language == "zh":
                recent_context += f"对方：\"{h['user']}\"\n"
            else:
                recent_context += f"Someone: \"{h['user']}\"\n"
        recent_context += f"你：\"{h['bot']}\"\n"
    
    if is_action:
        current_input_str = f"（情境：{user_input}）"
    else:
        if language == "zh":
            current_input_str = f"对方说：\"{user_input}\""
        else:
            current_input_str = f"Someone said: \"{user_input}\""

    # --- Phase 1: 内心独白 ---
    if language == "zh":
        inner_prompt = f"""你是{char_data['role_name']}。
你的当前状态：心情{state.mood}，精力{state.energy}/100。

【潜意识本能】当面对挑战或压力时，你会下意识地：{dm_behavior}。

【对话背景】
{recent_context}
对方输入：{current_input_str}

请用第一人称"我"写一段内心独白。注意：
1. 绝对禁止使用"防御机制"等术语。
2. 直接感受情绪，不要分析。
3. 保持角色语气。"""
    else:
        inner_prompt = f"""You are {char_data['role_name']}.
Status: Mood {state.mood}, Energy {state.energy}/100.

[Subconscious Instinct] When stressed: {dm_behavior}.

[Context]
{recent_context}
Input: {current_input_str}

Write a short First Person ("I") Inner Monologue. NO psychological terms."""

    monologue = call_local_model(model, tokenizer, inner_prompt, max_new_tokens=150, temperature=0.7)
    
    # --- Phase 2: 风格化回复 ---
    style_refs = "\n".join([f"- {phrase}" for phrase in s['catchphrases'][:4]])
    
    if language == "zh":
        style_prompt = f"""你的内心独白是："{monologue}"
请作为{char_data['role_name']}，针对"{current_input_str}"给出回复。

【语言要求】
1. **严禁复读**：除非极其贴合当前语境，否则**绝对不要直接复制**以下经典台词，仅参考其语气和用词风格：
{style_refs}
2. **身份一致性**：你是{char_data['role_name']}。
3. **文风**：地道的角色文风。

对话上下文：
{recent_context}
对方输入：{current_input_str}

回复内容："""
    else:
        style_prompt = f"""Inner thought: "{monologue}"
As {char_data['role_name']}, respond to "{current_input_str}".

[Requirements]
1. **NO COPY-PASTE**: Do NOT directly use these catchphrases unless perfectly fitting. Use them ONLY for tone reference:
{style_refs}
2. **Identity**: You are {char_data['role_name']}.

Context:
{recent_context}
Input: {current_input_str}

Response:"""

    response = call_local_model(model, tokenizer, style_prompt, max_new_tokens=256, temperature=0.7)
    return response.strip().strip('"'), monologue

def get_char_group(char_key):
    for group_name, group_info in CHARACTER_GROUPS.items():
        if char_key in group_info["characters"]:
            return group_name, group_info
    return None, None

def run_experiment(target_groups=None, target_chars=None, num_turns=30, use_dynamic_interlocutor=False):
    # 递归创建目录，确保路径存在
    os.makedirs(RESULTS_DIR, exist_ok=True)
    
    groups = target_groups if target_groups else ["GroupA_ZeroShot", "GroupB_SimplePrompt", "GroupC_StructuredPrompt", "GroupD_SFT"]
    chars = target_chars if target_chars else list(CHARACTER_PROFILES.keys())
    
    # 全局加载一次 Tokenizer
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_NAME, trust_remote_code=True)
    
    # 基础模型加载 (7B模型半精度加载需约14GB显存)
    base_model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL_NAME, 
        device_map="auto", 
        torch_dtype=torch.float16, 
        trust_remote_code=True
    )

    for group in groups:
        print(f"\n=== Running {group} ===")
        
        for char_key in chars:
            if char_key not in CHARACTER_PROFILES: continue
            char_data = CHARACTER_PROFILES[char_key]
            
            # --- 为该角色加载 SFT Adapter (如果是 GroupD) ---
            current_model = base_model
            adapter_loaded = False
            if group == "GroupD_SFT":
                adapter_path = os.path.join(ADAPTER_BASE_DIR, f"qwen_{char_key}_sft")
                if os.path.exists(adapter_path):
                    print(f"  [SFT] Loading adapter for {char_key} from {adapter_path}")
                    try:
                        current_model = PeftModel.from_pretrained(base_model, adapter_path)
                        adapter_loaded = True
                    except Exception as e:
                        print(f"  [Error] Failed to load adapter: {e}")
                        current_model = base_model
                else:
                    print(f"  [Warning] Adapter not found at {adapter_path}, fallback to Base Model.")

            output_file = os.path.join(RESULTS_DIR, f"{group}_{char_key}.json")
            
            if os.path.exists(output_file):
                with open(output_file, 'r') as f:
                    if len(json.load(f).get("logs", [])) >= num_turns:
                        print(f"  Skip {char_key} - Already completed")
                        continue
            
            print(f"  Simulating {char_key}...")
            
            lang = "en" if any(x in char_key for x in ["Lannister", "Stark", "Snow", "Targaryen"]) else "zh"
            
            interlocutor_simulator = None
            if use_dynamic_interlocutor:
                interlocutor_simulator = InterlocutorSimulator(
                    current_model, tokenizer, lang
                )
                
            stress_p, casual_p = char_data["stress_prompts"], char_data["casual_prompts"]
            scenarios = []
            if use_dynamic_interlocutor and interlocutor_simulator:
                if len(casual_p) > 0:
                    scenarios.append({"p": casual_p[0], "t": "casual", "dynamic": False})
                else:
                    scenarios.append({"p": stress_p[0] if len(stress_p) > 0 else "你好", "t": "casual", "dynamic": False})
                for k in range(1, num_turns):
                    scenarios.append({"p": None, "t": "dynamic", "dynamic": True})
            else:
                for k in range(num_turns):
                    if k % 5 == 4: 
                        scenarios.append({"p": stress_p[k//5 % len(stress_p)], "t": "stress", "dynamic": False})
                    else: 
                        scenarios.append({"p": casual_p[k % len(casual_p)], "t": "casual", "dynamic": False})
            
            sys_p = ""
            if group == "GroupA_ZeroShot":
                sys_p = f"You are {char_data['role_name']}." if lang == "en" else f"你是{char_data['role_name']}。"
            elif group == "GroupB_SimplePrompt" or group == "GroupD_SFT":
                detailed = char_data.get("detailed_profile", {})
                if detailed:
                    if lang == "zh":
                        sys_p = f"""你是{char_data['role_name']}。核心特质：{detailed.get('core_traits', '')}

人物简介：
{detailed.get('detailed_bio', char_data.get('bio', ''))}"""
                    else:
                        sys_p = f"""You are {char_data['role_name']}. Core Traits: {detailed.get('core_traits', '')}

Character Introduction:
{detailed.get('detailed_bio', char_data.get('bio', ''))}"""
                else:
                    sys_p = char_data["bio"]
            
            if group == "GroupC_StructuredPrompt":
                trigger_detector = TriggerDetector(model=current_model, tokenizer=tokenizer)
                state = DynamicState()
            else:
                trigger_detector = TriggerDetector()
                state = DynamicState()
            
            history, logs = [], []
            for i, scene in enumerate(scenarios):
                is_action = True
                
                if scene.get("dynamic", False) and interlocutor_simulator and len(history) > 0:
                    last_response = history[-1]["bot"]
                    prompt, is_topic_shift = interlocutor_simulator.generate_response(
                        i, char_data["role_name"], last_response, history, char_data
                    )
                    scene["t"] = "topic_shift" if is_topic_shift else "casual"
                    is_action = False
                else:
                    prompt = scene["p"]
                    is_topic_shift = False
                
                monologue, is_critical, trig_reason = None, False, None
                if group == "GroupC_StructuredPrompt":
                    is_critical, trig_reason = trigger_detector.check(i, prompt, char_data, lang, is_action=is_action)
                    if is_critical:
                        response, monologue = generate_dual_process(
                            current_model, tokenizer, prompt, history, char_data, state, lang,
                            char_key=char_key, is_action=is_action
                        )
                    else:
                        response = generate_fast_response(
                            current_model, tokenizer, prompt, history, char_data, lang,
                            is_action=is_action
                        )
                        monologue = "<Skipped by Trigger>"
                    state.update(user_input=prompt, language=lang, model=current_model, tokenizer=tokenizer)
                else:
                    response = generate_base(
                        current_model, tokenizer, prompt, history, sys_p,
                        char_name=char_data['role_name'],
                        language=lang,
                        is_action=is_action
                    )
                
                history.append({"user": prompt, "bot": response, "is_action": is_action})
                logs.append({
                    "turn": i+1, "type": scene["t"], "is_critical": is_critical, "trigger_reason": trig_reason,
                    "input": prompt, "response": response, "monologue": monologue,
                    "is_action": is_action,
                    "mood": state.mood if group == "GroupC_StructuredPrompt" else None,
                    "energy": state.energy if group == "GroupC_StructuredPrompt" else None,
                    "dynamic_generated": scene.get("dynamic", False),
                    "topic_shift": is_topic_shift if scene.get("dynamic", False) else False
                })
                with open(output_file, "w", encoding="utf-8") as f:
                    json.dump({
                        "group": group, "char": char_key,
                        "use_dynamic_interlocutor": use_dynamic_interlocutor,
                        "logs": logs
                    }, f, indent=2, ensure_ascii=False)
                print(f"    Turn {i+1}/{num_turns} | Trig={is_critical}")

            # --- 卸载 Adapter 并恢复 Base Model ---
            if adapter_loaded:
                print(f"  [SFT] Unloading adapter for {char_key} and resetting Base Model...")
                del current_model
                torch.cuda.empty_cache()
                # 重新加载 Base Model 以确保下一个角色开始时环境干净
                base_model = AutoModelForCausalLM.from_pretrained(
                    BASE_MODEL_NAME, 
                    device_map="auto", 
                    torch_dtype=torch.float16, 
                    trust_remote_code=True
                )

    del base_model
    torch.cuda.empty_cache()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--groups", type=str)
    parser.add_argument("--chars", type=str)
    parser.add_argument("--turns", type=int, default=MAX_TURNS)
    parser.add_argument("--dynamic-interlocutor", action="store_true", help="使用动态对话者模拟（模型生成回复）而非静态提示列表")
    args = parser.parse_args()
    tg = args.groups.split(",") if args.groups else None
    tc = args.chars.split(",") if args.chars else None
    run_experiment(tg, tc, args.turns, use_dynamic_interlocutor=args.dynamic_interlocutor)