# V3 translation quality record

Date: 2026-10-10. Production build, desktop headless Chromium (Playwright), 375px viewport. Pipeline: glossary → rules → Firefox Translations en→zh-Hans v2.2 (bergamot v0.6.0). **Desktop verification only; not phone numbers.** "accepted" = exact match against the accept list; outputs that read correctly but differ in wording count as not accepted.

| set | phrases | accepted | glossary | rule | model | untranslated |
| --- | --- | --- | --- | --- | --- | --- |
| holdout (20, not in glossary) | 20 | 8 | 1 | 3 | 16 | 0 |
| probe (50, local) | 50 | 47 | 42 | 6 | 2 | 0 |

Deterministic checks (negation prefix kept, quantity/percent tokens kept): all passed

| set | input | output | provider | accepted |
| --- | --- | --- | --- | --- |
| holdout | Grilled Salmon | 烤鲑鱼 | model | yes |
| holdout | Mushroom Risotto | 蘑菇里索托 | model | no |
| holdout | No Ice | 不要冰 | rule | yes |
| holdout | Lobster Roll | 龙虾卷 | model | yes |
| holdout | Lamb Chops (2) | 羊肉排 (2) | model | no |
| holdout | Pork Katsu Curry | 猪肉加苏咖喱 | model | no |
| holdout | Garlic Shrimp | 大蒜虾 | model | no |
| holdout | Chocolate Lava Cake | 巧克力熔岩蛋糕 | model | yes |
| holdout | Beef Tacos (3) | 牛肉玉米饼 (3) | model | no |
| holdout | Veggie Spring Rolls | 蔬菜春卷 | glossary | yes |
| holdout | Spicy Miso Ramen | 辣莫拉莫·拉蒙 | model | no |
| holdout | Thai Basil Chicken | 泰国罗勒鸡 | model | no |
| holdout | Crispy Calamari | 克里斯皮·卡拉马里 | model | no |
| holdout | Add Egg | 加鸡蛋 | rule | yes |
| holdout | Lg Lemonade | 大份柠檬水 | rule | yes |
| holdout | House Red Wine | 红葡萄酒屋 | model | no |
| holdout | Truffle Fries | 松露 | model | no |
| holdout | Chkn Caesar Wrap | 鸡肉凯撒包装 | model | no |
| holdout | Seafood Paella | 海鲜海鲜 | model | no |
| holdout | Sweet Corn Soup | 甜玉米汤 | model | yes |
| probe | Pineapple Fried Rice | 菠萝炒饭 | glossary | yes |
| probe | Fried Tofu (12) | 炸豆腐 (12) | glossary | yes |
| probe | Milk Tea | 奶茶 | glossary | yes |
| probe | Pad Thai | 泰式炒河粉 | glossary | yes |
| probe | Pad Kra Pow | 泰式打抛 | glossary | yes |
| probe | Brown Sugar Milk | 黑糖牛奶 | glossary | yes |
| probe | Chkn Fr Rice | 鸡肉炒饭 | glossary | yes |
| probe | Veg Spr Roll | 蔬菜春卷 | glossary | yes |
| probe | Beef Ndl Soup | 牛肉面 | glossary | yes |
| probe | w/o Onion | 不要洋葱 | rule | yes |
| probe | No Peanuts | 不要花生 | rule | yes |
| probe | Extra Spicy | 特辣 | glossary | yes |
| probe | GF Pad Thai | 泰式GF Pad | model | no |
| probe | BF Combo | BF组合 | model | no |
| probe | Cheeseburger | 芝士汉堡 | glossary | yes |
| probe | French Fries | 薯条 | glossary | yes |
| probe | Caesar Salad | 凯撒沙拉 | glossary | yes |
| probe | Chicken Tikka Masala | 咖喱鸡 | glossary | yes |
| probe | Tom Yum Soup | 冬阴功汤 | glossary | yes |
| probe | Green Curry Chicken | 绿咖喱鸡 | glossary | yes |
| probe | Spring Rolls (2) | 春卷 (2) | glossary | yes |
| probe | Pork Dumplings | 猪肉饺子 | glossary | yes |
| probe | Salmon Nigiri | 三文鱼握寿司 | glossary | yes |
| probe | Spicy Tuna Roll | 辣金枪鱼卷 | glossary | yes |
| probe | Pho Tai | 生牛肉河粉 | glossary | yes |
| probe | Banh Mi | 越南法棍 | glossary | yes |
| probe | Iced Latte | 冰拿铁 | glossary | yes |
| probe | Thai Iced Tea | 泰式奶茶 | glossary | yes |
| probe | Mango Sticky Rice | 芒果糯米饭 | glossary | yes |
| probe | Garlic Naan | 蒜香馕 | glossary | yes |
| probe | Lg Fries | 大份薯条 | rule | yes |
| probe | Sm Coke | 小份可乐 | rule | no |
| probe | CHKN TIKKA MASALA | 咖喱鸡 | glossary | yes |
| probe | 2x Egg Roll | 2x 蛋卷 | glossary | yes |
| probe | Add Avocado | 加牛油果 | rule | yes |
| probe | No Cilantro | 不要香菜 | rule | yes |
| probe | Side of Rice | 配米饭 | glossary | yes |
| probe | Kids Mac & Cheese | 儿童奶酪通心粉 | glossary | yes |
| probe | Buffalo Wings | 水牛城辣鸡翅 | glossary | yes |
| probe | Clam Chowder | 蛤蜊浓汤 | glossary | yes |
| probe | Service Charge 18% | 服务费 18% | glossary | yes |
| probe | Bubble Tea w/ Boba | 珍珠奶茶 | glossary | yes |
| probe | Hot & Sour Soup | 酸辣汤 | glossary | yes |
| probe | Kung Pao Chicken | 宫保鸡丁 | glossary | yes |
| probe | General Tso's Chicken | 左宗棠鸡 | glossary | yes |
| probe | Mapo Tofu | 麻婆豆腐 | glossary | yes |
| probe | Xiao Long Bao | 小笼包 | glossary | yes |
| probe | Pork Belly Bao | 五花肉刈包 | glossary | yes |
| probe | Ramen (Tonkotsu) | 豚骨拉面 | glossary | yes |
| probe | Half Rack Ribs | 半份肋排 | glossary | yes |
