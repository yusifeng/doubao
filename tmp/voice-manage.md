<span id="62f0ae93"></span>

# 音色管理接口

<span id="cda74ea0"></span>

## API接入说明

<span id="2e989347"></span>

### 访问鉴权

1. 鉴权方式说明 [公共参数--API签名调用指南-火山引擎 (volcengine.com)](https://www.volcengine.com/docs/6369/67268)

线上请求地址域名 open.volcengineapi.com

2. 固定公共参数

```Plain Text
Region = "cn-north-1"
Service = "speech_saas_prod"
Version = "2023-11-07"
解释
```

3. AKSK获取 [访问控制-火山引擎 (volcengine.com)](https://console.volcengine.com/iam/keymanage)

说明：[Access Key（密钥）管理--API访问密钥（Access Key）-火山引擎 (volcengine.com)](https://www.volcengine.com/docs/6291/65568)

4. 调用方式
   1. SDK [SDK概览--API签名调用指南-火山引擎 (volcengine.com)](https://www.volcengine.com/docs/6369/156029)
   2. 直接签名后调用

结合文档内api说明调用 `ListMegaTTSTrainStatus` （<span style="background-color: rgba(255,246,122, 0.8)">ListMegaTTSTrainStatus已下线，demo中action直接替换为BatchListMegaTTSTrainStatus即可</span>）的例子(\*其他语言和使用sdk调用的方式请参考火山鉴权源码[说明](https://www.volcengine.com/docs/6369/185600) 一)

3.  示例代码：

<Attachment link="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/9f981eea343847aaac7fb1b011ba8d86~tplv-goo7wpa0wc-image.image" name="sign.go" ></Attachment>
<Attachment link="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/24071af48c6049f28f6b60e3239da6f2~tplv-goo7wpa0wc-image.image" name="sign.py" ></Attachment>
<Attachment link="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/a467b4e10dc44767a9226f09fa3f6ecf~tplv-goo7wpa0wc-image.image" name="sign.java" ></Attachment>
<span id="15d26d16"></span>

### 错误码

1. 非 **2xx** 开头的HTTP返回状态码被可以认为是**错误**
2. 错误的HTTP返回结构体如下

```JSON
{
    "ResponseMetadata":
    {
        "RequestId": "20220214145719010211209131054BC103", // header中的X-Top-Request-Id参数
        "Action": "ListMegaTTSTrainStatus",
        "Version": "2023-11-07",
        "Service": "{Service}",// header中的X-Top-Service参数
        "Region": "{Region}", // header中的X-Top-Region参数
        "Error":
        {
            "Code": "InternalError.NotCaptured",
            "Message": "xxx"
        }
    }
}
```

3. **"ResponseMetadata.Error.Code"** 客户端可以依照这个字段判断错误种类，已知种类和含义如下

| | | \
|Code |Description |
|---|---|
| | | \
|OperationDenied.InvalidSpeakerID |账号或AppID无权限操作或无法操作SpeakerID列表中的一个或多个实例 |
| | | \
|OperationDenied.InvalidParameter |请求体字段不合法（缺失必填字段、类型错误等） |
| | | \
|InternalError.NotCaptured |未知的服务内部错误 |

<span id="243e99e6"></span>

## API列表

<span id="a8755e5b"></span>

### 分页查询SpeakerID状态 `BatchListMegaTTSTrainStatus`

<span id="99293c5f"></span>

#### 接口说明

查询已购买的音色状态；支持使用token和声明页数两种分页方式；其中，

- 分页token在最后一页为空
- 分页token采用私有密钥进行加密
- 分页接口为新接口，不影响已有接口行为

<span id="1008d9c9"></span>

#### **请求方式**

`POST`
<span id="4c708b2a"></span>

#### 请求参数

| | | | | | \
|Parameter |Type |Must |Argument type |Description |
|---|---|---|---|---|
| | | | | | \
|Content-Type | |Y |header |固定字符串: application/json; charset=utf-8 |
| | | | | | \
|Action |string |Y |query |BatchListMegaTTSTrainStatus |
| | | | | | \
|Version |string |Y |query |2023-11-07 |
| | | | | | \
|AppID |string |Y |body |AppID |
| | | | | | \
|SpeakerIDs |[]string |N |body |SpeakerID的列表，传空为返回指定APPID下的全部SpeakerID |
| | | | | | \
|State |string |N |body |音色状态，支持取值：Unknown、Training、Success、Active、Expired、Reclaimed |\
| | | | |详见附录：State状态枚举值 |
| | | | | | \
|PageNumber |int |N |body |页数, 需大于0, 默认为1 |
| | | | | | \
|PageSize |int |N |body |每页条数, 必须在范围[1, 100]内, 默认为10 |
| | | | | | \
|NextToken |string |N |body |上次请求返回的字符串; 如果不为空的话, 将覆盖PageNumber及PageSize的值 |
| | | | | | \
|MaxResults |int |N |body |与NextToken相配合控制返回结果的最大数量; 如果不为空则必须在范围[1, 100]内, 默认为10 |
| | | | | | \
|OrderTimeStart |int64 |N |body |下单时间检索上边界毫秒级时间戳，受实例交付速度影响，可能比支付完成的时间晚 |
| | | | | | \
|OrderTimeEnd |int64 |N |body |下单时间检索下边界毫秒级时间戳，受实例交付速度影响，可能比支付完成的时间晚 |
| | | | | | \
|ExpireTimeStart |int64 |N |body |实例到期时间的检索上边界毫秒级时间戳 |
| | | | | | \
|ExpireTimeEnd |int64 |N |body |实例到期时间的检索下边界毫秒级时间戳 |

<span id="07ec8372"></span>

#### 返回数据

```JSON
{
    "ResponseMetadata":
    {
        "RequestId": "20220214145719010211209131054BC103", // header中的X-Top-Request-Id参数
        "Action": "BatchListMegaTTSTrainStatus",
        "Version": "2023-11-07",
        "Service": "{Service}",// header中的X-Top-Service参数
        "Region": "{Region}" // header中的X-Top-Region参数},
        "Result":
        {
            "AppID": "xxx",
            "TotalCount": 2, // speakerIDs总数量
            "NextToken": "", // NextToken字符串，可发送请求后面的结果; 如果没有更多结果将为空
            "PageNumber": 1, // 使用分页参数时的当前页数
            "PageSize": 2, // 使用分页参数时当前页包含的条数
            "Statuses":
            [
                {
                    "CreateTime": 1700727790000, // unix epoch格式的创建时间，单位ms
                    "DemoAudio": "https://example.com", // http demo链接
                    "InstanceNO": "Model_storage_meUQ8YtIPm", // 火山引擎实例Number
                    "IsActivable": true, // 是否可激活
                    "SpeakerID": "S_VYBmqB0A", // speakerID
                    "State": "Success", // speakerID的状态
                    "Version": "V1" // speakerID已训练过的次数
                    "ExpireTime": 1964793599000, // 到期时间
                    "OrderTime": 1701771990000, // 下单时间
                    "Alias": "", // 别名，和控制台同步
                    "AvailableTrainingTimes": 10, // 剩余训练次数
                    "ModelTypeDetails":[
                          {
                                 "ModelType": 1, // ModelType
                                 "DemoAudio": "https://example.com",
                                 "IclSpeakerId": "icl_123456",
                                 "ResourceID": "seed-icl-1.0"
                          }
                    ]

                },
                {
                    "SpeakerID": "S_VYBmqB0B", // speakerID
                    "State": "Unknown", // speakerID的状态
                    "Version": "V1" // speakerID已训练过的次数
                }
            ]
        }
}
```

<span id="7c43fc32"></span>

### 音色下单`OrderAccessResourcePacks`

<span id="7461c273"></span>

#### 接口说明

一步下单音色并支付订单，前置条件：

- **AppID已经开通声音复刻**
- **账户里面有足够的余额（或代金券），可以自动支付该订单**
- **频率限制：2分钟内最多下单2000个音色**

<span id="1c84b987"></span>

#### **请求方式**

`POST`
<span id="b4eac64b"></span>

#### 请求参数

| | | | | | \
|Parameter |Type |Must |Argument type |Description |
|---|---|---|---|---|
| | | | | | \
|Content-Type | |Y |header |固定字符串: application/json; charset=utf-8 |
| | | | | | \
|Action |string |Y |query |OrderAccessResourcePacks |
| | | | | | \
|Version |string |Y |query |2023-11-07 |
| | | | | | \
|AppID |int |Y |body |AppID |
| | | | | | \
|ResourceID |string |Y |body |平台的服务类型资源标识，必填： |\
| | | | |volc.megatts.voiceclone |
| | | | | | \
|Code |string |Y |body |平台的计费项标识，必填且唯一： |\
| | | | |Model_storage 声音复刻 |
| | | | | | \
|Times |int |Y |body |下单单个音色的时长，单位为月 |
| | | | | | \
|Quantity |int |Y |body |下单音色的个数，如100，即为购买100个音色 |
| | | | | | \
|AutoUseCoupon |bool |N |body |是否自动使用代金券 |
| | | | | | \
|CouponID |string |N |body |代金券ID，通过[代金券管理](https://www.volcengine.com/docs/6269/67339)获取 |
| | | | | | \
|ResourceTag |object |N |body |项目&标签账单配置 |
| | | | | | \
|ResourceTag.CustomTags |map[string]string |N |body |标签，通过[标签管理](https://www.volcengine.com/docs/6649/189381)获取 |
| | | | | | \
|ResourceTag.ProjectName |string |N |body |项目名称，通过[项目管理](https://www.volcengine.com/docs/6649/94336)获取 |

<span id="db02ef6d"></span>

#### 请求示例

```JSON
{
    "AppID": 100000000,
    "ResourceID": "volc.megatts.voiceclone",
    "Code": "Model_storage",
    "Times": 12,
    "Quantity": 2000
}
```

<span id="27634009"></span>

#### 返回数据

```JSON
{
    "ResponseMetadata":
    {
        "RequestId": "20220214145719010211209131054BC103", // header中的X-Top-Request-Id参数
        "Action": "OrderAccessResourcePacks",
        "Version": "2023-11-07",
        "Service": "{Service}",// header中的X-Top-Service参数
        "Region": "{Region}" // header中的X-Top-Region参数},
        "Result":
        {
            "OrderIDs":
            [
                "Order20010000000000000001" // 购买成功返回的订单号ID
            ]
        }
}
```

<span id="3a657453"></span>

### 音色续费`RenewAccessResourcePacks`

<span id="7b5015fb"></span>

#### 接口说明

一步续费音色并支付订单，前置条件：

- **账户里面有足够的余额（或代金券），可以自动支付该订单**
- **频率限制：2分钟内最多续费2000个音色**

<span id="45184772"></span>

#### **请求方式**

`POST`
<span id="f2c357dd"></span>

#### 请求参数

| | | | | | \
|Parameter |Type |Must |Argument type |Description |
|---|---|---|---|---|
| | | | | | \
|Content-Type | |Y |header |固定字符串: application/json; charset=utf-8 |
| | | | | | \
|Action |string |Y |query |`RenewAccessResourcePacks` |
| | | | | | \
|Version |string |Y |query |2023-11-07 |
| | | | | | \
|Times |int |Y |body |续费音色的时长，单位为月 |
| | | | | | \
|SpeakerIDs |[]string |N |body |要续费的SpeakerID的列表，可以通过`BatchListMegaTTSTrainStatus`接口过滤获取 |
| | | | | | \
|AutoUseCoupon |bool |N |body |是否自动使用代金券 |
| | | | | | \
|CouponID |string |N |body |代金券ID，通过[代金券管理](https://www.volcengine.com/docs/6269/67339)获取 |

<span id="1b2c0e9f"></span>

#### 返回数据

```JSON
{
    "ResponseMetadata":
    {
        "RequestId": "20220214145719010211209131054BC103", // header中的X-Top-Request-Id参数
        "Action": "OrderAccessResourcePacks",
        "Version": "2023-11-07",
        "Service": "{Service}",// header中的X-Top-Service参数
        "Region": "{Region}" // header中的X-Top-Region参数},
        "Result":
        {
            "OrderIDs":
            [
                "Order20010000000000000001" // 购买成功返回的订单号ID
            ]
        }
}
```

<span id="c2b77147"></span>

### 附录

<span id="cc0d2106"></span>

#### State状态枚举值

| | | \
|State |Description |
|---|---|
| | | \
|Unknown |SpeakerID尚未进行训练 |
| | | \
|Training |声音复刻训练中（长时间处于复刻中状态请联系火山引擎技术人员） |
| | | \
|Success |声音复刻训练成功，可以进行TTS合成 |
| | | \
|Active |已激活（无法再次训练） |
| | | \
|Expired |火山控制台实例已过期或账号欠费 |
| | | \
|Reclaimed |火山控制台实例已回收 |

<span id="7e757ed2"></span>

#### 常见错误枚举值

| | | \
|Error |Description |
|---|---|
| | | \
|InvalidParameter |请求参数错误 |
| | | \
|Forbidden.InvalidService |未开通声音复刻 |
| | | \
|Forbidden.ErrAccountNotPermission |账号没有权限 |
| | | \
|Forbidden.LimitedTradingFrequency |下单限流错误 |
| | | \
|InvalidParameter.AppID |AppID错误或者无效 |
| | | \
|NotFound.ResourcePack |音色（或资源包）不存在 |
| | | \
|InvalidParameter.InstanceNumber |无效的音色（或实例） |
