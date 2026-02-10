-- MySQL dump 10.13  Distrib 5.7.44, for Linux (x86_64)
--
-- Host: localhost    Database: s2b2c_db
-- ------------------------------------------------------
-- Server version	5.7.44

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `addresses`
--

DROP TABLE IF EXISTS `addresses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `addresses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL COMMENT '用户ID',
  `receiver_name` varchar(50) NOT NULL COMMENT '收货人姓名',
  `phone` varchar(20) NOT NULL COMMENT '联系电话',
  `province` varchar(50) DEFAULT NULL COMMENT '省份',
  `city` varchar(50) DEFAULT NULL COMMENT '城市',
  `district` varchar(50) DEFAULT NULL COMMENT '区县',
  `detail` varchar(200) DEFAULT NULL COMMENT '详细地址',
  `is_default` tinyint(4) DEFAULT '0' COMMENT '是否默认地址: 1-是, 0-否',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `addresses_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `addresses`
--

LOCK TABLES `addresses` WRITE;
/*!40000 ALTER TABLE `addresses` DISABLE KEYS */;
INSERT INTO `addresses` VALUES (1,2,'看电视','13057188954','北京市','北京市','东城区','新年吉祥',0,'2026-02-08 11:43:59','2026-02-08 11:43:59'),(2,3,'搞好没','12345678910','北京市','北京市','东城区','你摸',0,'2026-02-08 12:06:08','2026-02-08 12:06:08');
/*!40000 ALTER TABLE `addresses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `admins`
--

DROP TABLE IF EXISTS `admins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admins` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL COMMENT '登录账号',
  `password_hash` varchar(128) NOT NULL COMMENT '密码哈希',
  `salt` varchar(32) NOT NULL COMMENT '密码盐值',
  `name` varchar(50) DEFAULT NULL COMMENT '管理员姓名',
  `role` varchar(30) DEFAULT 'operator' COMMENT '角色: super_admin/admin/operator/finance/customer_service',
  `permissions` text COMMENT 'JSON格式权限列表',
  `phone` varchar(20) DEFAULT NULL COMMENT '手机号',
  `email` varchar(100) DEFAULT NULL COMMENT '邮箱',
  `last_login_at` datetime DEFAULT NULL COMMENT '最后登录时间',
  `last_login_ip` varchar(50) DEFAULT NULL COMMENT '最后登录IP',
  `status` tinyint(4) DEFAULT '1' COMMENT '状态: 1-启用, 0-禁用',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admins`
--

LOCK TABLES `admins` WRITE;
/*!40000 ALTER TABLE `admins` DISABLE KEYS */;
INSERT INTO `admins` VALUES (1,'jxalk','704bb25b1e5fe63f7a6b3b8325da7a44ee0b982124381930d6c0214fbceb5a488379d7b507b57e7c8a7eca02d1147c9cdc4f509963dd2fa5f6bdfdc4b2f2e410','db22aea56e1a43f973ab453aef850d43','超级管理员','super_admin',NULL,NULL,NULL,'2026-02-08 10:58:58','::ffff:127.0.0.1',1,'2026-02-06 15:31:23','2026-02-08 10:58:58');
/*!40000 ALTER TABLE `admins` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `banners`
--

DROP TABLE IF EXISTS `banners`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `banners` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(100) DEFAULT NULL COMMENT '标题/备注',
  `image_url` varchar(500) NOT NULL COMMENT '图片URL',
  `link_type` varchar(20) DEFAULT 'none' COMMENT '链接类型: none/product/page/url',
  `link_value` varchar(255) DEFAULT NULL COMMENT '链接值: 商品ID/页面路径/外部URL',
  `position` varchar(50) DEFAULT 'home' COMMENT '展示位置: home/category/activity',
  `sort_order` int(11) DEFAULT '0' COMMENT '排序权重',
  `start_time` datetime DEFAULT NULL COMMENT '开始展示时间',
  `end_time` datetime DEFAULT NULL COMMENT '结束展示时间',
  `status` tinyint(4) DEFAULT '1' COMMENT '状态: 1-启用, 0-禁用',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `banners`
--

LOCK TABLES `banners` WRITE;
/*!40000 ALTER TABLE `banners` DISABLE KEYS */;
INSERT INTO `banners` VALUES (2,'66','https://img.cdn1.vip/i/6985fc53654df_1770388563.webp','none',NULL,'home',0,NULL,NULL,1,'2026-02-06 22:39:41','2026-02-06 22:39:41');
/*!40000 ALTER TABLE `banners` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cart_items`
--

DROP TABLE IF EXISTS `cart_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cart_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL COMMENT '用户ID',
  `product_id` int(11) NOT NULL COMMENT '商品ID',
  `sku_id` int(11) DEFAULT NULL COMMENT 'SKU ID，无规格商品可为null',
  `quantity` int(11) DEFAULT '1' COMMENT '数量',
  `selected` tinyint(1) DEFAULT '1' COMMENT '是否选中结算',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_cart_item` (`user_id`,`product_id`,`sku_id`),
  KEY `product_id` (`product_id`),
  KEY `sku_id` (`sku_id`),
  CONSTRAINT `cart_items_ibfk_25` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cart_items_ibfk_26` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT `cart_items_ibfk_27` FOREIGN KEY (`sku_id`) REFERENCES `product_skus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cart_items`
--

LOCK TABLES `cart_items` WRITE;
/*!40000 ALTER TABLE `cart_items` DISABLE KEYS */;
INSERT INTO `cart_items` VALUES (1,2,1,NULL,1,1,'2026-02-08 11:43:40','2026-02-08 11:43:40'),(2,3,1,NULL,1,1,'2026-02-08 12:05:50','2026-02-08 12:05:50');
/*!40000 ALTER TABLE `cart_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `categories`
--

DROP TABLE IF EXISTS `categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '类目名称',
  `parent_id` int(11) DEFAULT NULL COMMENT '父级类目ID，null为顶级类目',
  `icon` varchar(255) DEFAULT NULL COMMENT '类目图标URL',
  `sort_order` int(11) DEFAULT '0' COMMENT '排序权重，数字越大越靠前',
  `status` tinyint(4) DEFAULT '1' COMMENT '状态: 1-启用, 0-禁用',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `parent_id` (`parent_id`),
  CONSTRAINT `categories_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `categories`
--

LOCK TABLES `categories` WRITE;
/*!40000 ALTER TABLE `categories` DISABLE KEYS */;
INSERT INTO `categories` VALUES (1,'测试',NULL,NULL,0,1,'2026-02-07 23:14:47','2026-02-07 23:14:47');
/*!40000 ALTER TABLE `categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `commission_logs`
--

DROP TABLE IF EXISTS `commission_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `commission_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL COMMENT '订单ID',
  `user_id` int(11) NOT NULL COMMENT '获得佣金的用户ID',
  `amount` decimal(10,2) NOT NULL COMMENT '佣金金额',
  `type` varchar(20) DEFAULT NULL COMMENT '佣金类型: Direct/Indirect/Stock_Diff',
  `status` varchar(20) DEFAULT 'pending' COMMENT '佣金状态: pending/available/cancelled',
  `available_at` datetime DEFAULT NULL COMMENT 'T+7可用时间',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `remark` varchar(255) DEFAULT NULL COMMENT '备注说明',
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  KEY `user_id` (`user_id`),
  KEY `idx_settle` (`status`, `available_at`),
  CONSTRAINT `commission_logs_ibfk_17` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commission_logs_ibfk_18` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `commission_logs`
--

LOCK TABLES `commission_logs` WRITE;
/*!40000 ALTER TABLE `commission_logs` DISABLE KEYS */;
INSERT INTO `commission_logs` VALUES (1,4,2,149.00,'gap','frozen',NULL,'2026-02-08 12:07:03','2026-02-08 12:07:03','团队级差利润 (0级 -> 3级)');
/*!40000 ALTER TABLE `commission_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `contents`
--

DROP TABLE IF EXISTS `contents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `contents` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` varchar(30) NOT NULL COMMENT '内容类型: about/culture/team/contact/page',
  `slug` varchar(100) DEFAULT NULL COMMENT '页面标识符，用于URL访问',
  `title` varchar(200) NOT NULL COMMENT '标题',
  `subtitle` varchar(300) DEFAULT NULL COMMENT '副标题',
  `cover_image` varchar(500) DEFAULT NULL COMMENT '封面图',
  `content` longtext COMMENT '富文本内容',
  `extra_data` text COMMENT 'JSON格式扩展数据',
  `sort_order` int(11) DEFAULT '0' COMMENT '排序权重',
  `status` tinyint(4) DEFAULT '1' COMMENT '状态: 1-发布, 0-草稿',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contents`
--

LOCK TABLES `contents` WRITE;
/*!40000 ALTER TABLE `contents` DISABLE KEYS */;
/*!40000 ALTER TABLE `contents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dealers`
--

DROP TABLE IF EXISTS `dealers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `dealers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL COMMENT '关联用户ID',
  `dealer_no` varchar(50) NOT NULL COMMENT '经销商编号',
  `company_name` varchar(200) DEFAULT NULL COMMENT '公司名称',
  `license_no` varchar(100) DEFAULT NULL COMMENT '营业执照号',
  `license_image` varchar(500) DEFAULT NULL COMMENT '营业执照图片',
  `contact_name` varchar(50) NOT NULL COMMENT '联系人姓名',
  `contact_phone` varchar(20) NOT NULL COMMENT '联系电话',
  `contact_email` varchar(100) DEFAULT NULL COMMENT '联系邮箱',
  `address` varchar(500) DEFAULT NULL COMMENT '地址',
  `level` tinyint(4) DEFAULT '1' COMMENT '经销商等级: 1/2/3',
  `settlement_type` varchar(20) DEFAULT 'monthly' COMMENT '结算方式: monthly/weekly/realtime',
  `settlement_rate` decimal(5,4) DEFAULT '0.1000' COMMENT '分成比例',
  `bank_name` varchar(100) DEFAULT NULL COMMENT '开户银行',
  `bank_account` varchar(50) DEFAULT NULL COMMENT '银行账号',
  `bank_holder` varchar(50) DEFAULT NULL COMMENT '开户人姓名',
  `contract_start` datetime DEFAULT NULL COMMENT '合同开始日期',
  `contract_end` datetime DEFAULT NULL COMMENT '合同结束日期',
  `total_sales` decimal(12,2) DEFAULT '0.00' COMMENT '累计销售额',
  `total_commission` decimal(12,2) DEFAULT '0.00' COMMENT '累计佣金',
  `team_count` int(11) DEFAULT '0' COMMENT '团队人数',
  `status` varchar(20) DEFAULT 'pending' COMMENT '状态: pending/approved/rejected/suspended',
  `approved_at` datetime DEFAULT NULL COMMENT '审核通过时间',
  `approved_by` int(11) DEFAULT NULL COMMENT '审核人ID',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  UNIQUE KEY `dealer_no` (`dealer_no`),
  KEY `approved_by` (`approved_by`),
  CONSTRAINT `dealers_ibfk_17` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `dealers_ibfk_18` FOREIGN KEY (`approved_by`) REFERENCES `admins` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dealers`
--

LOCK TABLES `dealers` WRITE;
/*!40000 ALTER TABLE `dealers` DISABLE KEYS */;
/*!40000 ALTER TABLE `dealers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `materials`
--

DROP TABLE IF EXISTS `materials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `materials` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` varchar(20) NOT NULL COMMENT '素材类型: image/video/text/poster',
  `title` varchar(200) NOT NULL COMMENT '素材标题',
  `description` text COMMENT '素材描述/文案内容',
  `url` varchar(500) DEFAULT NULL COMMENT '资源URL（图片/视频）',
  `thumbnail_url` varchar(500) DEFAULT NULL COMMENT '缩略图URL',
  `product_id` int(11) DEFAULT NULL COMMENT '关联商品ID',
  `category` varchar(50) DEFAULT NULL COMMENT '素材分类: product/activity/brand',
  `tags` varchar(255) DEFAULT NULL COMMENT '标签，逗号分隔',
  `download_count` int(11) DEFAULT '0' COMMENT '下载/使用次数',
  `sort_order` int(11) DEFAULT '0' COMMENT '排序权重',
  `status` tinyint(4) DEFAULT '1' COMMENT '状态: 1-启用, 0-禁用',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `materials_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `materials`
--

LOCK TABLES `materials` WRITE;
/*!40000 ALTER TABLE `materials` DISABLE KEYS */;
/*!40000 ALTER TABLE `materials` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL COMMENT '接收通知的用户ID, 0=管理员通知',
  `title` varchar(100) NOT NULL COMMENT '通知标题',
  `content` text NOT NULL COMMENT '通知内容',
  `type` varchar(20) NOT NULL COMMENT '通知类型: upgrade/commission/stock/system/refund/refund_admin/system_alert',
  `is_read` tinyint(1) DEFAULT '0' COMMENT '是否已读',
  `related_id` varchar(50) DEFAULT NULL COMMENT '关联ID (如订单ID)',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_type` (`type`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COMMENT='通知消息表（无外键，允许user_id=0管理员通知）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,2,'新成员加入','微信用户 已通过您的邀请码加入您的团队！','commission',0,'3','2026-02-08 12:06:57','2026-02-08 12:06:57'),(2,3,'绑定上级成功','您已成功加入 666 的团队。','system',0,'2','2026-02-08 12:06:57','2026-02-08 12:06:57'),(3,2,'收益到账提醒','您的下级产生了一笔新订单，您获得级差收益 ¥149.00。','commission',0,'4','2026-02-08 12:07:03','2026-02-08 12:07:03');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_no` varchar(50) NOT NULL COMMENT '订单号',
  `buyer_id` int(11) NOT NULL COMMENT '购买者ID',
  `distributor_id` int(11) DEFAULT NULL COMMENT '分销商ID',
  `distributor_role` tinyint(4) DEFAULT NULL COMMENT '下单时分销商角色（锁定）',
  `product_id` int(11) NOT NULL COMMENT '商品ID',
  `quantity` int(11) DEFAULT '1' COMMENT '数量',
  `total_amount` decimal(10,2) NOT NULL COMMENT '订单总金额',
  `actual_price` decimal(10,2) NOT NULL COMMENT '实际支付价格',
  `fulfillment_type` varchar(20) DEFAULT NULL COMMENT '履约类型: Company/Partner',
  `fulfillment_partner_id` int(11) DEFAULT NULL COMMENT '实际发货的Partner ID',
  `status` varchar(20) DEFAULT 'pending' COMMENT '订单状态: pending/paid/agent_confirmed/shipping_requested/shipped/completed/cancelled/refunded',
  `paid_at` datetime DEFAULT NULL COMMENT '支付时间',
  `shipped_at` datetime DEFAULT NULL COMMENT '发货时间',
  `completed_at` datetime DEFAULT NULL COMMENT '完成时间',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `agent_id` int(11) DEFAULT NULL COMMENT '所属代理商ID（团队归属）',
  `tracking_no` varchar(100) DEFAULT NULL COMMENT '物流单号',
  `sku_id` int(11) DEFAULT NULL COMMENT 'SKU ID',
  `address_id` int(11) DEFAULT NULL COMMENT '收货地址ID',
  `address_snapshot` text COMMENT '收货地址快照（JSON），下单时冻结',
  `remark` varchar(255) DEFAULT NULL COMMENT '订单备注',
  `agent_confirmed_at` datetime DEFAULT NULL COMMENT '代理人确认时间',
  `shipping_requested_at` datetime DEFAULT NULL COMMENT '申请发货时间',
  `settlement_at` datetime DEFAULT NULL COMMENT '佣金结算时间（完成后+7天）',
  `commission_settled` tinyint(4) DEFAULT '0' COMMENT '佣金是否已结算: 0-未结算, 1-已结算',
  `middle_commission_total` decimal(10,2) DEFAULT '0.00' COMMENT '中间层级佣金总额（发货利润扣除用）',
  `shipping_fee` decimal(10,2) DEFAULT '0.00' COMMENT '运费金额，包邮为0',
  `platform_stock_deducted` tinyint(1) NOT NULL DEFAULT '1' COMMENT '创建订单时是否扣了平台库存: 1-已扣, 0-未扣（走代理商云库存兜底）',
  `locked_agent_cost` decimal(10,2) DEFAULT NULL COMMENT '下单时锁定的代理商进货价（单价），发货利润以此为准',
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_no` (`order_no`),
  KEY `buyer_id` (`buyer_id`),
  KEY `distributor_id` (`distributor_id`),
  KEY `product_id` (`product_id`),
  KEY `sku_id` (`sku_id`),
  KEY `address_id` (`address_id`),
  KEY `idx_agent_id` (`agent_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `orders_ibfk_31` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `orders_ibfk_32` FOREIGN KEY (`distributor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `orders_ibfk_33` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `orders_ibfk_34` FOREIGN KEY (`sku_id`) REFERENCES `product_skus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `orders_ibfk_35` FOREIGN KEY (`address_id`) REFERENCES `addresses` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
INSERT INTO `orders` VALUES (1,'ORD20260208635935',2,NULL,2,1,1,299.00,299.00,NULL,NULL,'paid','2026-02-08 11:44:16',NULL,NULL,'2026-02-08 11:44:10','2026-02-08 11:44:16',NULL,NULL,NULL,1,NULL,'',NULL,NULL,NULL,0,0.00,0.00,1,NULL),(2,'ORD20260208304412',2,NULL,3,1,1,299.00,299.00,NULL,NULL,'completed','2026-02-08 12:03:44','2026-02-08 12:08:14','2026-02-08 12:08:23','2026-02-08 11:56:42','2026-02-08 12:08:23',NULL,NULL,NULL,1,NULL,'',NULL,NULL,'2026-02-15 12:08:23',0,0.00,0.00,1,NULL),(3,'ORD20260208775474',2,NULL,3,1,1,299.00,299.00,NULL,NULL,'pending',NULL,NULL,NULL,'2026-02-08 12:04:11','2026-02-08 12:04:11',NULL,NULL,NULL,1,NULL,'',NULL,NULL,NULL,0,0.00,0.00,1,NULL),(4,'ORD20260208542290',3,NULL,0,1,1,299.00,299.00,NULL,NULL,'shipped','2026-02-08 12:07:03','2026-02-08 12:09:27',NULL,'2026-02-08 12:06:13','2026-02-08 12:09:27',NULL,NULL,NULL,2,NULL,'',NULL,NULL,NULL,0,0.00,0.00,1,NULL);
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_skus`
--

DROP TABLE IF EXISTS `product_skus`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_skus` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL COMMENT '关联商品ID',
  `sku_code` varchar(50) DEFAULT NULL COMMENT 'SKU编码',
  `spec_name` varchar(100) NOT NULL COMMENT '规格名称，如"颜色"、"尺寸"',
  `spec_value` varchar(100) NOT NULL COMMENT '规格值，如"红色"、"XL"',
  `retail_price` decimal(10,2) NOT NULL COMMENT '零售价',
  `member_price` decimal(10,2) DEFAULT NULL COMMENT '会员价',
  `wholesale_price` decimal(10,2) DEFAULT NULL COMMENT '批发价',
  `stock` int(11) DEFAULT '0' COMMENT '库存数量',
  `image` varchar(255) DEFAULT NULL COMMENT 'SKU图片',
  `status` tinyint(4) DEFAULT '1' COMMENT '状态: 1-启用, 0-禁用',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `product_skus_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_skus`
--

LOCK TABLES `product_skus` WRITE;
/*!40000 ALTER TABLE `product_skus` DISABLE KEYS */;
/*!40000 ALTER TABLE `product_skus` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL COMMENT '商品名称',
  `category_id` int(11) DEFAULT NULL COMMENT '类目ID',
  `description` text COMMENT '商品描述',
  `images` text COMMENT '商品图片URLs（JSON数组）',
  `retail_price` decimal(10,2) NOT NULL COMMENT '零售价 ¥299',
  `stock` int(11) DEFAULT '0' COMMENT '公司库存',
  `status` tinyint(4) DEFAULT '1' COMMENT '状态: 1-上架, 0-下架',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `price_member` decimal(10,2) DEFAULT NULL COMMENT '会员价 ¥239',
  `price_leader` decimal(10,2) DEFAULT NULL COMMENT '团长价 ¥209',
  `price_agent` decimal(10,2) DEFAULT NULL COMMENT '代理价 ¥150',
  `commission_rate_1` decimal(4,2) DEFAULT NULL COMMENT '一级分销比例 (e.g. 0.20), 空则用默认',
  `commission_rate_2` decimal(4,2) DEFAULT NULL COMMENT '二级分销比例 (e.g. 0.10), 空则用默认',
  `member_price` decimal(10,2) DEFAULT NULL COMMENT '会员价（兼容旧字段）',
  `wholesale_price` decimal(10,2) DEFAULT NULL COMMENT '批发价（兼容旧字段）',
  PRIMARY KEY (`id`),
  KEY `category_id` (`category_id`),
  CONSTRAINT `products_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES (1,'666',1,'','[]',299.00,16,1,'2026-02-07 23:44:56','2026-02-08 12:06:13',NULL,NULL,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `refunds`
--

DROP TABLE IF EXISTS `refunds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `refunds` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `refund_no` varchar(50) NOT NULL COMMENT '退款单号',
  `order_id` int(11) NOT NULL COMMENT '关联订单ID',
  `user_id` int(11) NOT NULL COMMENT '申请用户ID',
  `type` varchar(20) DEFAULT 'refund_only' COMMENT '类型: refund_only/return_refund/exchange',
  `reason` varchar(50) NOT NULL COMMENT '退款原因: quality/wrong_item/not_needed/other',
  `description` text COMMENT '详细说明',
  `images` text COMMENT '凭证图片URLs（JSON数组）',
  `amount` decimal(10,2) NOT NULL COMMENT '退款金额',
  `refund_quantity` int(11) DEFAULT '0' COMMENT '退货数量（仅退货退款时有值，仅退款时为0不恢复库存）',
  `status` varchar(20) DEFAULT 'pending' COMMENT '状态: pending/approved/rejected/processing/completed/cancelled',
  `admin_id` int(11) DEFAULT NULL COMMENT '处理管理员ID',
  `admin_remark` varchar(255) DEFAULT NULL COMMENT '管理员备注',
  `reject_reason` varchar(255) DEFAULT NULL COMMENT '拒绝原因',
  `processed_at` datetime DEFAULT NULL COMMENT '处理时间',
  `completed_at` datetime DEFAULT NULL COMMENT '完成时间',
  `return_tracking_no` varchar(50) DEFAULT NULL COMMENT '退货快递单号',
  `return_company` varchar(50) DEFAULT NULL COMMENT '退货快递公司',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `refund_no` (`refund_no`),
  KEY `order_id` (`order_id`),
  KEY `user_id` (`user_id`),
  KEY `admin_id` (`admin_id`),
  KEY `idx_refund_status` (`status`),
  CONSTRAINT `refunds_ibfk_25` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `refunds_ibfk_26` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `refunds_ibfk_27` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `refunds`
--

LOCK TABLES `refunds` WRITE;
/*!40000 ALTER TABLE `refunds` DISABLE KEYS */;
/*!40000 ALTER TABLE `refunds` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `openid` varchar(100) NOT NULL COMMENT '微信openid',
  `nickname` varchar(100) DEFAULT NULL COMMENT '昵称',
  `avatar_url` varchar(255) DEFAULT NULL COMMENT '头像URL',
  `role_level` tinyint(4) DEFAULT '0' COMMENT '角色等级: 0-普通用户, 1-会员, 2-团长, 3-代理商',
  `parent_id` int(11) DEFAULT NULL COMMENT '上级用户ID',
  `parent_openid` varchar(100) DEFAULT NULL COMMENT '上级openid（冗余字段）',
  `stock_count` int(11) DEFAULT '0' COMMENT '云仓库存（仅代理商有效）',
  `balance` decimal(10,2) DEFAULT '0.00' COMMENT '可提现余额',
  `referee_count` int(11) DEFAULT '0' COMMENT '直推人数',
  `order_count` int(11) DEFAULT '0' COMMENT '累计订单数',
  `total_sales` decimal(12,2) DEFAULT '0.00' COMMENT '累计销售额',
  `last_login` datetime DEFAULT NULL COMMENT '最后登录时间',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `agent_id` int(11) DEFAULT NULL COMMENT '所属代理商ID',
  `invite_code` varchar(6) DEFAULT NULL COMMENT '6位数字唯一邀请码',
  `joined_team_at` datetime DEFAULT NULL COMMENT '加入团队时间（绑定上级时设置）',
  `debt_amount` decimal(10,2) DEFAULT '0.00' COMMENT '欠款金额（佣金追回余额不足时的待还金额）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `openid` (`openid`),
  UNIQUE KEY `invite_code` (`invite_code`),
  KEY `parent_id` (`parent_id`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'ozsE818oOo5rkV3iW32_2FYmW7_U','微信用户','',0,NULL,NULL,0,0.00,0,0,0.00,'2026-02-06 22:22:48','2026-02-06 22:22:48','2026-02-06 22:22:48',NULL,NULL,NULL,0.00),(2,'og35g3XlNoiPQER_CDK8tLp7-wJQ','666','',3,NULL,NULL,0,0.00,1,2,598.00,'2026-02-08 11:56:29','2026-02-07 22:58:17','2026-02-08 12:06:57',NULL,'708645',NULL,0.00),(3,'og35g3TQoQWdVqqA6dBA53XfI0TM','人机姐姐','',1,2,'og35g3XlNoiPQER_CDK8tLp7-wJQ',0,0.00,0,1,299.00,'2026-02-08 12:05:42','2026-02-08 12:05:42','2026-02-08 12:07:54',2,'355948','2026-02-08 12:05:42',0.00);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `withdrawals`
--

DROP TABLE IF EXISTS `withdrawals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `withdrawals` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `withdrawal_no` varchar(50) NOT NULL COMMENT '提现单号',
  `user_id` int(11) NOT NULL COMMENT '用户ID',
  `amount` decimal(10,2) NOT NULL COMMENT '提现金额',
  `fee` decimal(10,2) DEFAULT '0.00' COMMENT '手续费',
  `actual_amount` decimal(10,2) NOT NULL COMMENT '实际到账金额',
  `method` varchar(20) DEFAULT 'wechat' COMMENT '提现方式: wechat/bank/alipay',
  `account_name` varchar(100) DEFAULT NULL COMMENT '收款账户名',
  `account_no` varchar(100) DEFAULT NULL COMMENT '收款账号（部分脱敏存储）',
  `bank_name` varchar(100) DEFAULT NULL COMMENT '银行名称',
  `status` varchar(20) DEFAULT 'pending' COMMENT '状态: pending/approved/processing/completed/rejected/failed',
  `reject_reason` varchar(255) DEFAULT NULL COMMENT '拒绝原因',
  `processed_by` int(11) DEFAULT NULL COMMENT '处理人ID（管理员）',
  `processed_at` datetime DEFAULT NULL COMMENT '处理时间',
  `completed_at` datetime DEFAULT NULL COMMENT '完成时间',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `withdrawal_no` (`withdrawal_no`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `withdrawals_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `withdrawals`
--

LOCK TABLES `withdrawals` WRITE;
/*!40000 ALTER TABLE `withdrawals` DISABLE KEYS */;
/*!40000 ALTER TABLE `withdrawals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 's2b2c_db'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-08 13:08:40
