## 接口信息

调用地址：https://wuliu.market.alicloudapi.com/kdi**

请求方式：GET

返回类型：JSON

API 调用：[API 简单身份认证调用方法（APPCODE）](https://help.aliyun.com/zh/api-gateway/traditional-api-gateway/use-cases/call-apis)[API 签名认证调用方法（AppKey & AppSecret）](https://help.aliyun.com/zh/api-gateway/traditional-api-gateway/use-cases/call-apis)

获取认证：[AppKey & AppCode](https://market.console.aliyun.com/?productCode=cmapi021863)

## 接口参数

请求参数（Header）

请求参数（Query）

| 字段名称        | 必填 | 字段详情                                                     |
| :-------------- | :--- | :----------------------------------------------------------- |
| no **string**   | Y    | 快递单号 【顺丰和丰网、中通等请输入单号 : 收件人或寄件人手机号后四位。例如：123456789:1234】实例值：780098068058:1234 |
| type **string** | N    | 快递公司字母简写：不知道可不填 95%能自动识别，填写查询速度会更快【见产品详情】实例值：zto |

请求参数（Body）



| **参数** | **类型** | **必须** | **示例值**   | **描述**                                                     |
| -------- | -------- | -------- | ------------ | ------------------------------------------------------------ |
| **no**   | string   | 是       | 454244690951 | 运单编号  【顺丰和丰网、中通等，需要输入单号: 收件人或寄件人手机号后四位。例如：123456789:1234】 |
| **type** | string   | 否       | zto          | 快递公司代码[见附表]1 可不填， 95%能自动识别，填写查询速度更快2 **自动识别不能100%准确**3 **解释**：一个单号可对应多个快递公司如：1000745320654，韵达，EMS，百世都有该单号记录。这种单号系统无法准确自动识别。 4 **其他注意****：****【1】**邮政有： 邮政包裹【chinapost】 和 邮政速递物流【EMS】。【2】韵达有韵达快递（yunda）和韵达快运（yunda56） |

**返回结果说明**

| 字段名         | 类型   | 示例值                                                       | 描述                                                         |
| -------------- | ------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| msg            | string | ok                                                           | 消息                                                         |
| result         | object | {...}                                                        | 结果集                                                       |
| issign         | string | 1                                                            | 是否本人签收【不准 可能物管帮收】                            |
| number         | string | 454244690951                                                 | 运单编号                                                     |
| expName        | string | 中通快递                                                     | 快递公司名字                                                 |
| deliverystatus | string | 3                                                            | 投递状态 0快递收件(揽件)1.在途中 2.正在派件 3.已签收 4.派送失败 5.疑难件 6.退件签收 |
| expSite        | string | www.zto.com                                                  | 快递公司官网                                                 |
| expPhone       | string | 95311                                                        | 快递公司电话                                                 |
| courier        | string | 张三                                                         | 快递员                                                       |
| courierPhone   | string | 1308110XXXX                                                  | 快递员电话                                                   |
| updateTime     | string | 2019-08-27 13:56:19                                          | 最新快递物流轨迹的时间                                       |
| takeTime       | string | 2天20小时14分                                                | 发货到收货耗时(截止最新轨迹)                                 |
| type           | string | zto                                                          | 快递公司编码                                                 |
| list           | array  | [...]                                                        | 结果集                                                       |
| time           | string | 2017-09-19 18:01:22                                          | 时间点                                                       |
| status         | string | [成都市] [成都华阳]的派件已签收 感谢使用中通快递,期待再次为您服务! | 事件详情                                                     |

**快递投递状态码(deliverystatus)**

| **状态码** | **说明**                                                     |
| ---------- | ------------------------------------------------------------ |
| 0          | 快递收件(揽件)                                               |
| 1          | 在途中                                                       |
| 2          | 正在派件                                                     |
| 3          | 已签收                                                       |
| 4          | 派送失败（无法联系到收件人或客户要求择日派送，地址不详或手机号不清） |
| 5          | 疑难件（收件人拒绝签收，地址有误或不能送达派送区域，收费等原因无法正常派送） |
| 6          | 退件签收                                                     |

**status外层返回状态码**

| **状态码** | **说明**                                                     |
| ---------- | ------------------------------------------------------------ |
| 0          | 查询正常                                                     |
| 201        | 快递单号错误                                                 |
| 203        | 快递公司不存在                                               |
| 204        | 快递公司识别失败                                             |
| 205        | 没有信息；**单号错误** (一个单号对应多个快递公司，请求须指定快递公司) |
| 207        | IP被限制,IP黑名单；                                          |

**快递公司列表【陆续更新】**

| **快递公司**            | **type****缩写** | **快递公司**         | **type****缩写** |
| ----------------------- | ---------------- | -------------------- | ---------------- |
| AAE                     | AAEWEB           | 澳天速运             | AOTSD            |
| 安迅物流                | ANXL             | 安鲜达               | EXFRESH          |
| 安捷物流                | AJWL             | ANTS                 | ANTS             |
| 安世通快递              | ASTEXPRESS       | 爱拜物流             | IBUY8            |
| 澳多多国际速递          | ADODOXOM         | Aplus物流            | APLUSEX          |
| 安达速递                | ADAPOST          | 澳世速递             | AUSEXPRESS       |
| 澳洲迈速快递            | MAXEEDEXPRESS    | 昂威物流             | ONWAY            |
| Aramex                  | ARAMEX           | 能达                 | ND56             |
| DHL国内件               | DHL              | DHL国际件            | DHL_EN           |
| DPEX                    | DPEX             | 平安快递             | EFSPOST          |
| D速                     | DEXP             | 秦远物流             | CHINZ56          |
| EMS                     | EMS              | 全晨                 | QCKD             |
| EWE                     | EWE              | 全峰                 | QFKD             |
| FedEx                   | FEDEX            | 全一                 | APEX             |
| FedEx国际               | FEDEXIN          | 如风达               | RFD              |
| PCA                     | PCA              | 三态速递             | SFC              |
| TNT                     | TNT              | 申通                 | STO              |
| UPS                     | UPS              | 盛丰                 | SFWL             |
| 安捷快递                | ANJELEX          | 盛辉                 | SHENGHUI         |
| 安能                    | ANE              | 顺达快递             | SDEX             |
| 安能快递                | ANEEX            | 顺丰                 | SFEXPRESS        |
| 安信达                  | ANXINDA          | 苏宁                 | SUNING           |
| 百福东方                | EES              | 速尔                 | SURE             |
| 百世快递                | HTKY             | 天地华宇             | HOAU             |
| 百世快运                | BSKY             | 天天                 | TTKDEX           |
| 程光                    | FLYWAYEX         | 万庚                 | VANGEN           |
| 大田                    | DTW              | 万家物流             | WANJIA           |
| 德邦                    | DEPPON           | 万象                 | EWINSHINE        |
| 飞洋                    | GCE              | 文捷航空             | GZWENJIE         |
| 凤凰                    | PHOENIXEXP       | 新邦                 | XBWL             |
| 富腾达                  | FTD              | 信丰                 | XFEXPRESS        |
| 共速达                  | GSD              | 亚风                 | BROADASIA        |
| 国通                    | GTO              | 宜送                 | YIEXPRESS        |
| 黑狗                    | BLACKDOG         | 易达通               | QEXPRESS         |
| 恒路                    | HENGLU           | 易通达               | ETD              |
| 鸿远                    | HYE              | 优速                 | UC56             |
| 华企                    | HQKY             | 邮政包裹             | CHINAPOST        |
| 急先达                  | JOUST            | 原飞航               | YFHEX            |
| 加运美速递              | TMS              | 圆通                 | YTO              |
| 佳吉                    | JIAJI            | 源安达               | YADEX            |
| 佳怡                    | JIAYI            | 远成                 | YCGWL            |
| 嘉里物流                | KERRY            | 越丰                 | YFEXPRESS        |
| 锦程快递                | HREX             | 运通                 | YTEXPRESS        |
| 晋越                    | PEWKEE           | 韵达快递             | YUNDA            |
| 京东                    | JD               | 宅急送               | ZJS              |
| 京广速递                | KKE              | 芝麻开门             | ZMKMEX           |
| 九曳                    | JIUYESCM         | 中国东方             | COE              |
| 跨越速运                | KYEXPRESS        | 中铁快运             | CRE              |
| 快捷                    | FASTEXPRESS      | 中铁物流             | ZTKY             |
| 蓝天                    | BLUESKY          | 中通                 | ZTO              |
| 联昊通                  | LTS              | 龙邦                 | LBEX             |
| 中通快运                | ZTO56            | 中邮                 | CNPL             |
| 壹米滴答                | YIMIDIDA         | 品骏快递             | PJKD             |
| 日日顺物流              | RRS              | 汇通快递             | HTKY             |
| 宇鑫物流                | YXWL             | 邮政国际包裹         | INTMAIL          |
| 东骏快捷                | DJ56             | 联邦快递             | FEDEX            |
| 联邦快递国际            | FEDEX_GJ         | 配思航宇             | PEISI            |
| 澳邮专线(澳邮中国快运)  | AYCA             | 八达通               | BDT              |
| 城市100                 | CITY100          | 城际快递             | CJKD             |
| 递四方速递              | D4PX             | 飞康达               | FKD              |
| 广通                    | GTS              | 环球速运             | HQSY             |
| 好来运快递              | HYLSD            | 捷安达               | JAD              |
| 捷特快递                | JTKD             | 景光物流             | JGWL             |
| 民邦快递                | MB               | 美快国际物流         | MKGJ             |
| 明亮物流                | MLWL             | 平安达腾飞快递       | PADTF            |
| 泛捷快递                | PANEX            | 全日通快递           | QRT              |
| 全信通                  | QXT              | 瑞丰速递             | RFEX             |
| 赛澳递                  | SAD              | 圣安物流             | SAWL             |
| 上大物流                | SDWL             | 速通物流             | ST               |
| 速腾快递                | STWL             | 速必达物流           | SUBIDA           |
| 万家康                  | WJK              | 新杰物流             | XJ               |
| 增益快递                | ZENY             | 中邮物流             | ZYWL             |
| 河马动力                | HEMA             | 澳通速递             | AOL              |
| GLS                     | GLS              | 安的列斯群岛邮政     | IADLSQDYZ        |
| 澳大利亚邮政            | IADLYYZ          | 阿尔巴尼亚邮政       | IAEBNYYZ         |
| 阿尔及利亚邮政          | IAEJLYYZ         | 阿富汗邮政           | IAFHYZ           |
| 安哥拉邮政              | IAGLYZ           | 阿根廷邮政           | IAGTYZ           |
| 埃及邮政                | IAJYZ            | 阿鲁巴邮政           | IALBYZ           |
| 奥兰群岛邮政            | IALQDYZ          | 阿联酋邮政           | IALYYZ           |
| 阿曼邮政                | IAMYZ            | 阿塞拜疆邮政         | IASBJYZ          |
| 埃塞俄比亚邮政          | IASEBYYZ         | 爱沙尼亚邮政         | IASNYYZ          |
| 阿森松岛邮政            | IASSDYZ          | 博茨瓦纳邮政         | IBCWNYZ          |
| 波多黎各邮政            | IBDLGYZ          | 冰岛邮政             | IBDYZ            |
| 白俄罗斯邮政            | IBELSYZ          | 波黑邮政             | IBHYZ            |
| 保加利亚邮政            | IBJLYYZ          | 巴基斯坦邮政         | IBJSTYZ          |
| 黎巴嫩邮政              | IBLNYZ           | 便利速递             | IBLSD            |
| 玻利维亚邮政            | IBLWYYZ          | 巴林邮政             | IBLYZ            |
| 百慕达邮政              | IBMDYZ           | 波兰邮政             | IBOLYZ           |
| 宝通达                  | IBTD             | 贝邮宝               | IBYB             |
| 出口易                  | ICKY             | 达方物流             | IDFWL            |
| 德国邮政                | IDGYZ            | 爱尔兰邮政           | IE               |
| 厄瓜多尔邮政            | IEGDEYZ          | 俄罗斯邮政           | IELSYZ           |
| 厄立特里亚邮政          | IELTLYYZ         | 飞特物流             | IFTWL            |
| 瓜德罗普岛EMS           | IGDLPDEMS        | 瓜德罗普岛邮政       | IGDLPDYZ         |
| 俄速递                  | IGJESD           | 哥伦比亚邮政         | IGLBYYZ          |
| 格陵兰邮政              | IGLLYZ           | 哥斯达黎加邮政       | IGSDLJYZ         |
| 韩国邮政                | IHGYZ            | 华翰物流             | IHHWL            |
| 互联易                  | IHLY             | 哈萨克斯坦邮政       | IHSKSTYZ         |
| 黑山邮政                | IHSYZ            | 津巴布韦邮政         | IJBBWYZ          |
| 吉尔吉斯斯坦邮政        | IJEJSSTYZ        | 捷克邮政             | IJKYZ            |
| 加纳邮政                | IJNYZ            | 柬埔寨邮政           | IJPZYZ           |
| 克罗地亚邮政            | IKNDYYZ          | 肯尼亚邮政           | IKNYYZ           |
| 科特迪瓦EMS             | IKTDWEMS         | 科特迪瓦邮政         | IKTDWYZ          |
| 卡塔尔邮政              | IKTEYZ           | 利比亚邮政           | ILBYYZ           |
| 林克快递                | ILKKD            | 罗马尼亚邮政         | ILMNYYZ          |
| 卢森堡邮政              | ILSBYZ           | 拉脱维亚邮政         | ILTWYYZ          |
| 立陶宛邮政              | ILTWYZ           | 列支敦士登邮政       | ILZDSDYZ         |
| 马尔代夫邮政            | IMEDFYZ          | 摩尔多瓦邮政         | IMEDWYZ          |
| 马耳他邮政              | IMETYZ           | 孟加拉国EMS          | IMJLGEMS         |
| 摩洛哥邮政              | IMLGYZ           | 毛里求斯邮政         | IMLQSYZ          |
| 马来西亚EMS             | IMLXYEMS         | 马来西亚邮政         | IMLXYYZ          |
| 马其顿邮政              | IMQDYZ           | 马提尼克EMS          | IMTNKEMS         |
| 马提尼克邮政            | IMTNKYZ          | 墨西哥邮政           | IMXGYZ           |
| 南非邮政                | INFYZ            | 尼日利亚邮政         | INRLYYZ          |
| 挪威邮政                | INWYZ            | 葡萄牙邮政           | IPTYYZ           |
| 全球快递                | IQQKD            | 全通物流             | IQTWL            |
| 苏丹邮政                | ISDYZ            | 萨尔瓦多邮政         | ISEWDYZ          |
| 塞尔维亚邮政            | ISEWYYZ          | 斯洛伐克邮政         | ISLFKYZ          |
| 斯洛文尼亚邮政          | ISLWNYYZ         | 塞内加尔邮政         | ISNJEYZ          |
| 塞浦路斯邮政            | ISPLSYZ          | 沙特阿拉伯邮政       | ISTALBYZ         |
| 土耳其邮政              | ITEQYZ           | 泰国邮政             | ITGYZ            |
| 特立尼达和多巴哥EMS     | ITLNDHDBGE       | 突尼斯邮政           | ITNSYZ           |
| 坦桑尼亚邮政            | ITSNYYZ          | 危地马拉邮政         | IWDMLYZ          |
| 乌干达邮政              | IWGDYZ           | 乌克兰EMS            | IWKLEMS          |
| 乌克兰邮政              | IWKLYZ           | 乌拉圭邮政           | IWLGYZ           |
| 文莱邮政                | IWLYZ            | 乌兹别克斯坦EMS      | IWZBKSTEMS       |
| 乌兹别克斯坦邮政        | IWZBKSTYZ        | 西班牙邮政           | IXBYYZ           |
| 小飞龙物流              | IXFLWL           | 新喀里多尼亚邮政     | IXGLDNYYZ        |
| 新加坡EMS               | IXJPEMS          | 新加坡邮政           | IXJPYZ           |
| 叙利亚邮政              | IXLYYZ           | 希腊邮政             | IXLYZ            |
| 夏浦世纪                | IXPSJ            | 夏浦物流             | IXPWL            |
| 新西兰邮政              | IXXLYZ           | 匈牙利邮政           | IXYLYZ           |
| 意大利邮政              | IYDLYZ           | 印度尼西亚邮政       | IYDNXYYZ         |
| 印度邮政                | IYDYZ            | 英国邮政             | IYGYZ            |
| 伊朗邮政                | IYLYZ            | 亚美尼亚邮政         | IYMNYYZ          |
| 也门邮政                | IYMYZ            | 越南邮政             | IYNYZ            |
| 以色列邮政              | IYSLYZ           | 易通关               | IYTG             |
| 燕文物流                | IYWWL            | 直布罗陀邮政         | IZBLTYZ          |
| 智利邮政                | IZLYZ            | 日本邮政             | JP               |
| 荷兰邮政                | NL               | ONTRAC               | ONTRAC           |
| 全球邮政                | QQYZ             | 瑞典邮政             | RDSE             |
| 瑞士邮政                | SWCH             | 安圭拉邮政           | ANGUILAYOU       |
| APAC                    | APAC             | USPS美国邮政         | USPS             |
| 日本大和运输(Yamato)    | YAMA             | YODEL                | YODEL            |
| 约旦邮政                | YUEDANYOUZ       | 奥地利邮政           | AT               |
| 民航                    | CAE              | 欧亚专线             | EUASIA           |
| 亚马逊                  | AMAZON           | 澳门邮政             | AOMENYZ          |
| CCES快递                | CCES             | 贝海国际             | BHGJ             |
| 北青小红帽              | BQXHM            | 八方安运             | BFAY             |
| 鸿桥供应链              | HOTSCM           | 长沙创一             | CSCY             |
| 成都善途速运            | CDSTKY           | 联合运通             | CTG              |
| 冠达                    | GD               | 广东邮政             | GDEMS            |
| 高铁速递                | GTSD             | 汇丰物流             | HFWL             |
| 海派通物流公司          | HPTEX            | 华强物流             | hq568            |
| 豪翔物流                | HXWL             | 华夏龙物流           | HXLWL            |
| 盛邦物流                | SBWL             | 南方                 | NF               |
| 台湾邮政                | TAIWANYZ         | 速递e站              | SDEZ             |
| UEQ Express             | UEQ              | 迅驰物流             | XCWL             |
| 义达国际物流            | YDH              | 希优特               | XYT              |
| 运东西                  | YUNDX            | 亿翔快递             | YXKD             |
| 汇强快递                | ZHQKD            | 众通快递             | ZTE              |
| ACS雅仕快递             | ACS              | ADP Express Tracking | ADP              |
| Australia Post Tracking | AUSTRALIA        | 比利时邮政           | BEL              |
| BHT快递                 | BHT              | 秘鲁邮政             | BILUYOUZHE       |
| 巴西邮政                | BR               | 不丹邮政             | BUDANYOUZH       |
| DPD                     | DPD              | 丹麦邮政             | DK               |
| 国际e邮宝               | GJEYB            | EShipper             | ESHIPPER         |
| BCWELT                  | BCWELT           | 笨鸟国际             | BN               |
| UEX                     | UEX              | 爱购转运             | ZY_AG            |
| 爱欧洲                  | ZY_AOZ           | 加拿大邮政           | CA               |
| AXO                     | ZY_AXO           | 澳转运               | ZY_AZY           |
| 八达网                  | ZY_BDA           | 蜜蜂速递             | ZY_BEE           |
| 贝海速递                | ZY_BH            | 百利快递             | ZY_BL            |
| 斑马物流                | ZY_BM            | 败欧洲               | ZY_BOZ           |
| 百通物流                | ZY_BT            | 贝易购               | ZY_BYECO         |
| 策马转运                | ZY_CM            | 赤兔马转运           | ZY_CTM           |
| CUL中美速递             | ZY_CUL           | 德国海淘之家         | ZY_DGHT          |
| 德运网                  | ZY_DYW           | EFS POST             | ZY_EFS           |
| 宜送转运                | ZY_ESONG         | ETD                  | ZY_ETD           |
| 飞碟快递                | ZY_FD            | 飞鸽快递             | ZY_FG            |
| 风雷速递                | ZY_FLSD          | 风行快递             | ZY_FX            |
| 皓晨快递                | ZY_HC            | 皓晨优递             | ZY_HCYD          |
| 海带宝                  | ZY_HDB           | 汇丰美中速递         | ZY_HFMZ          |
| 豪杰速递                | ZY_HJSD          | 360hitao转运         | ZY_HTAO          |
| 海淘村                  | ZY_HTCUN         | 365海淘客            | ZY_HTKE          |
| 华通快运                | ZY_HTONG         | 海星桥快递           | ZY_HXKD          |
| 华兴速运                | ZY_HXSY          | 海悦速递             | ZY_HYSD          |
| 君安快递                | ZY_JA            | 时代转运             | ZY_JD            |
| 骏达快递                | ZY_JDKD          | 骏达转运             | ZY_JDZY          |
| 久禾快递                | ZY_JH            | 金海淘               | ZY_JHT           |
| 联邦转运FedRoad         | ZY_LBZY          | 领跑者快递           | ZY_LPZ           |
| 龙象快递                | ZY_LX            | 量子物流             | ZY_LZWL          |
| 明邦转运                | ZY_MBZY          | 美国转运             | ZY_MGZY          |
| 美嘉快递                | ZY_MJ            | 美速通               | ZY_MST           |
| 美西转运                | ZY_MXZY          | 168 美中快递         | ZY_MZ            |
| 欧e捷                   | ZY_OEJ           | 欧洲疯               | ZY_OZF           |
| 欧洲GO                  | ZY_OZGO          | 全美通               | ZY_QMT           |
| QQ-EX                   | ZY_QQEX          | 润东国际快线         | ZY_RDGJ          |
| 瑞天快递                | ZY_RT            | 瑞天速递             | ZY_RTSD          |
| SCS国际物流             | ZY_SCS           | 速达快递             | ZY_SDKD          |
| 四方转运                | ZY_SFZY          | SOHO苏豪国际         | ZY_SOHO          |
| Sonic-Ex速递            | ZY_SONIC         | 上腾快递             | ZY_ST            |
| 通诚美中快递            | ZY_TCM           | 天际快递             | ZY_TJ            |
| 天马转运                | ZY_TM            | 滕牛快递             | ZY_TN            |
| TrakPak                 | ZY_TPAK          | 太平洋快递           | ZY_TPY           |
| 唐三藏转运              | ZY_TSZ           | 天天海淘             | ZY_TTHT          |
| TWC转运世界             | ZY_TWC           | 同心快递             | ZY_TX            |
| 天翼快递                | ZY_TY            | 同舟快递             | ZY_TZH           |
| UCS合众快递             | ZY_UCS           | 文达国际DCS          | ZY_WDCS          |
| 星辰快递                | ZY_XC            | 迅达快递             | ZY_XDKD          |
| 信达速运                | ZY_XDSY          | 先锋快递             | ZY_XF            |
| 新干线快递              | ZY_XGX           | 西邮寄               | ZY_XIYJ          |
| 信捷转运                | ZY_XJ            | 优购快递             | ZY_YGKD          |
| 友家速递(UCS)           | ZY_YJSD          | 云畔网               | ZY_YPW           |
| 云骑快递                | ZY_YQ            | 一柒物流             | ZY_YQWL          |
| 优晟速递                | ZY_YSSD          | 易送网               | ZY_YSW           |
| 运淘美国                | ZY_YTUSA         | 至诚速递             | ZY_ZCSD          |
| 丹鸟快递                | DANNIAO          | 韵达快运(韵达物流)   | YUNDA56          |
| 长江国际速递            | CJGJ             | 极兔速递             | JITU             |
| 顺心捷达                | SXJD             | 众邮快递             | ZYKD             |
| 速派快递                | FASTGO           | 澳邮中国快运         | AUEXPRESS        |
| 汇森快运                | HUISEN           | 世华通物流           | SHT              |
| 领送供应链              | LS               | 云聚物流             | YJWL             |
| 丰网速运                | FWSY             | 中远快运             | ZYKY             |
| 百腾物流                | BETENG           | 環海快運国际物流     | HHGJ             |
| 中通冷链                | ZTOCC            | 中铁物流供应链       | CRSC             |
| 安得物流                | ANNTO            | 云途物流             | YUNTU            |
| 中洋国际                | ZYGJ             | 恒邦物流             | HBWL             |
| 华欣物流                | HUAXIN           | 中铁飞豹物流         | ZTFBWL           |
| 速邮达物流              | SUYODA           | 铁中快运             | TZKY             |
| 万家物流                | WANJIA           | 中途速递             | ZTCCE            |
| 小飞侠速递              | TCXFX            | 明通国际速递         | TNJEX            |
| 菜鸟国际快递            | CAINIAOKD        | 菜鸟快递             | CAINIAO          |
| 丹鸟国际快递            | DANNIAOKD        | 极速速运             | JISU             |



package com.aliyun.test;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.UnknownHostException;
import java.util.List;
import java.util.Map;

public class Tools {
    public static void main(String[] args) {
        String host = "https://wuliu.market.alicloudapi.com";// 【1】请求地址 支持http 和 https 及 WEBSOCKET
        String path = "/kdi";  // 【2】后缀
        String appcode = "你自己的AppCode"; // 【3】开通服务后 买家中心-查看AppCode
        String no = "780098068058";// 【4】请求参数，详见文档描述
        String type = "zto"; //  【4】请求参数，不知道可不填 95%能自动识别
        String urlSend = host + path + "?no=" + no +"&type="+type;  // 【5】拼接请求链接
        try {
            URL url = new URL(urlSend);
            HttpURLConnection httpURLCon = (HttpURLConnection) url.openConnection();
            httpURLCon .setRequestProperty("Authorization", "APPCODE " + appcode);// 格式Authorization:APPCODE (中间是英文空格)
            int httpCode = httpURLCon.getResponseCode();
            if (httpCode == 200) {
                String json = read(httpURLCon.getInputStream());
                System.out.println("正常请求计费(其他均不计费)");
                System.out.println("获取返回的json:");
                System.out.print(json);
            } else {
                Map<String, List<String>> map = httpURLCon.getHeaderFields();
                String error = map.get("X-Ca-Error-Message").get(0);
                if (httpCode == 400 && error.equals("Invalid AppCode `not exists`")) {
                    System.out.println("AppCode错误 ");
                } else if (httpCode == 400 && error.equals("Invalid Url")) {
                    System.out.println("请求的 Method、Path 或者环境错误");
                } else if (httpCode == 400 && error.equals("Invalid Param Location")) {
                    System.out.println("参数错误");
                } else if (httpCode == 403 && error.equals("Unauthorized")) {
                    System.out.println("服务未被授权（或URL和Path不正确）");
                } else if (httpCode == 403 && error.equals("Quota Exhausted")) {
                    System.out.println("套餐包次数用完 ");
                } else if (httpCode == 403 && error.equals("Api Market Subscription quota exhausted")) {
                    System.out.println("套餐包次数用完，请续购套餐");
                } else {
                    System.out.println("参数名错误 或 其他错误");
                    System.out.println(error);
                }
            }

        } catch (MalformedURLException e) {
            System.out.println("URL格式错误");
        } catch (UnknownHostException e) {
            System.out.println("URL地址错误");
        } catch (Exception e) {
            // 打开注释查看详细报错异常信息
            // e.printStackTrace();
        }
    
    }
    
    /*
     * 读取返回结果
     */
    private static String read(InputStream is) throws IOException {
        StringBuffer sb = new StringBuffer();
        BufferedReader br = new BufferedReader(new InputStreamReader(is));
        String line = null;
        while ((line = br.readLine()) != null) {
            line = new String(line.getBytes(), "utf-8");
            sb.append(line);
        }
        br.close();
        return sb.toString();
    }
}