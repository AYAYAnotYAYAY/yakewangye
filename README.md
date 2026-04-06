<![CDATA[# 泉寓门诊牙科官网项目（多语言 + SEO + 一键部署）

> 诊所名称：**泉寓门诊**  
> 俄语展示名：**Стоматология «Цюаньюй»**  
> 域名：**proclinicheihe.ru** / **prodentalheihe.ru**

这是一个可快速上线的牙科官网（纯静态站），已完成：

- ✅ 现代化营销型 UI（响应式）
- ✅ 三语言（俄语/中文/英语）
- ✅ 自动语言切换（IP + 浏览器 + 本地记忆）
- ✅ SEO 增强（Meta / OG / Twitter / hreflang / JSON-LD）
- ✅ SEO 文件完善（`sitemap.xml` / `robots.txt` / `favicon.svg`）
- ✅ 一键部署脚本（Nginx + HTTPS 证书 + 自动续期）

---

## 1) 项目结构

```bash
.
├── index.html
├── favicon.svg
├── sitemap.xml
├── robots.txt
├── deploy.sh
├── package.json
└── README.md
```

---

## 2) 已同步真实信息

- 诊所名：**泉寓门诊**
- 地址：**黑龙江省黑河市爱辉区花园街道环城东路33号**
- 电话：
  - `9619527988`
  - `9619579255`
- 域名：
  - `https://proclinicheihe.ru`
  - `https://prodentalheihe.ru`

---

## 3) 多语言与自动切换逻辑

语言优先级：

1. `localStorage(siteLang)`（用户手动选择）
2. URL 参数 `?lang=ru|zh|en`
3. IP 识别（`ipapi.co`）
4. 浏览器语言
5. 默认回退 **俄语 `ru`**

> 已按你要求：主语言默认俄语；未知国家也回退俄语。

---

## 4) SEO 完整度（已做）

- 基础：`title` / `description` / `keywords` / `robots` / canonical
- 多语言：`hreflang`（ru / en / zh / x-default）
- 社交：Open Graph / Twitter Card
- 结构化数据：JSON-LD（`Dentist`）
- 动态切换语言时同步更新 meta
- 站点资源：
  - `favicon.svg`（已接入 `<head>`）
  - `sitemap.xml`
  - `robots.txt`

---

## 5) 本地预览

```bash
npm install
npm start
```

---

## 6) 一键部署（含 HTTPS + 自动续期）

### 6.1 脚本说明

`deploy.sh` 会自动完成：

1. 安装 Nginx + Certbot
2. 同步站点文件到 `/var/www/quanyu-dental`
3. 生成并启用 Nginx 配置
4. 申请 Let’s Encrypt 证书（两个域名）
5. 自动开启 HTTPS 强制跳转
6. 配置自动续期（`certbot.timer` + cron 兜底）
7. 续期 dry-run 测试

### 6.2 使用方法（服务器上执行）

> 系统要求：Ubuntu / Debian（apt）

```bash
chmod +x deploy.sh
sudo ./deploy.sh --email 你的邮箱@example.com
```

可选参数：

```bash
sudo ./deploy.sh \
  --email admin@proclinicheihe.ru \
  --primary proclinicheihe.ru \
  --secondary prodentalheihe.ru \
  --site-dir /var/www/quanyu-dental \
  --source-dir /path/to/project
```

---

## 7) 部署前检查（重要）

在运行脚本前请确认：

- 域名 A 记录已指向服务器公网 IP
  - `proclinicheihe.ru`
  - `prodentalheihe.ru`
- 服务器安全组/防火墙已放通 `80` 和 `443`
- 使用 root/sudo 执行脚本

---

## 8) 部署后验证

```bash
# 检查 nginx
sudo nginx -t

# 检查证书定时器
systemctl status certbot.timer

# 检查 sitemap / robots
curl -I https://proclinicheihe.ru/sitemap.xml
curl -I https://proclinicheihe.ru/robots.txt
```

---

## 9) 维护修改

### 改电话/地址
在 `index.html` 搜索并替换：
- `9619527988`
- `9619579255`
- `黑龙江省黑河市爱辉区花园街道环城东路33号`

并同步 JSON-LD 字段。

### 改文案
统一改 `index.html` 里的 `const i18n = { ... }`（三语一起改）。

### 改图片
建议把线上示例图改为诊所真实图，放在本地 `/assets`。

---

## 10) 项目状态

- [x] UI/文案（参考俄语牙科站风格）
- [x] 三语言适配（RU/ZH/EN）
- [x] SEO v4（结构化+多语言）
- [x] `sitemap.xml` / `robots.txt` / `favicon`
- [x] 一键部署 + HTTPS + 自动续期
- [ ] 版本3（在线预约表单）待后续
]]>
