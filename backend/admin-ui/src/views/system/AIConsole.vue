<template>
    <div class="ai-console">
        <el-card class="chat-card" :body-style="{ padding: '0px', height: '100%', display: 'flex', flexDirection: 'column' }">
            <template #header>
                <div class="card-header">
                    <span>
                        <el-icon><Monitor /></el-icon> 超级管理员助手 (Admin Agent)
                    </span>
                    <el-tag size="small" type="success">Online</el-tag>
                </div>
            </template>

            <!-- Chat History -->
            <div class="chat-history" ref="chatContainer">
                <div v-if="messages.length === 0" class="welcome-screen">
                    <el-empty description="我是您的系统管理助手">
                        <template #image>
                            <el-icon :size="60" color="#409EFF"><Cpu /></el-icon>
                        </template>
                        <div class="capabilities">
                            <p>我可以帮您：</p>
                            <el-tag class="capability-tag" @click="fillInput('检查一下今天的系统报错')">🔍 检查系统日志</el-tag>
                            <el-tag class="capability-tag" @click="fillInput('现在的服务器负载怎么样？')">💻 监控服务器状态</el-tag>
                            <el-tag class="capability-tag" @click="fillInput('统计一下今天的订单和销售额')">📊 实时经营数据</el-tag>
                            <el-tag class="capability-tag" @click="fillInput('查询最近注册的5个用户')">👥 数据库查询</el-tag>
                        </div>
                    </el-empty>
                </div>

                <div v-for="(msg, index) in messages" :key="index" :class="['message-row', msg.role]">
                    <div class="avatar">
                        <el-avatar :icon="msg.role === 'user' ? 'UserFilled' : 'Monitor'" 
                            :bg-color="msg.role === 'user' ? '#409EFF' : '#67C23A'"></el-avatar>
                    </div>
                    <div class="message-content">
                        <div class="bubble">
                            <div v-if="msg.type === 'text'" v-html="formatText(msg.content)"></div>
                            <div v-else-if="msg.type === 'action'" class="tool-result">
                                <div class="tool-header">
                                    <el-icon><Tools /></el-icon> 执行工具: {{ msg.tool }}
                                </div>
                                <pre class="tool-output">{{ formatToolResult(msg.result) }}</pre>
                                <div class="tool-reply" v-html="formatText(msg.reply)"></div>
                            </div>
                        </div>
                        <div class="time">{{ formatTime(msg.time) }}</div>
                    </div>
                </div>

                <div v-if="loading" class="message-row ai">
                    <div class="avatar"><el-avatar icon="Monitor" bg-color="#67C23A"></el-avatar></div>
                    <div class="message-content">
                        <div class="bubble loading">
                            <span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Input Area -->
            <div class="input-area">
                <el-input
                    v-model="inputCommand"
                    placeholder="请输入指令，例如：'帮我看看今天有没有报错'..."
                    @keyup.enter="sendCommand"
                    :disabled="loading"
                >
                    <template #append>
                        <el-button @click="sendCommand" :loading="loading">发送</el-button>
                    </template>
                </el-input>
            </div>
        </el-card>
    </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { Monitor, UserFilled, Cpu, Tools } from '@element-plus/icons-vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const messages = ref([])
const inputCommand = ref('')
const loading = ref(false)
const chatContainer = ref(null)

const API_BASE = '/api' // Proxy handles this in dev

const formatTime = (date) => {
    return new Date(date).toLocaleTimeString()
}

const formatText = (text) => {
    if (!text) return ''
    // Simple markdown-like bold handling
    return text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')
}

const formatToolResult = (result) => {
    if (typeof result === 'object') {
        return JSON.stringify(result, null, 2)
    }
    return result
}

const fillInput = (text) => {
    inputCommand.value = text
}

const scrollToBottom = () => {
    nextTick(() => {
        if (chatContainer.value) {
            chatContainer.value.scrollTop = chatContainer.value.scrollHeight
        }
    })
}

const sendCommand = async () => {
    const cmd = inputCommand.value.trim()
    if (!cmd || loading.value) return

    // Add user message
    messages.value.push({
        role: 'user',
        type: 'text',
        content: cmd,
        time: new Date()
    })
    
    inputCommand.value = ''
    loading.value = true
    scrollToBottom()

    try {
        const token = localStorage.getItem('token')
        const res = await axios.post(`${API_BASE}/admin/agent/command`, { command: cmd }, {
            headers: { Authorization: `Bearer ${token}` }
        })

        if (res.data.code === 0) {
            const data = res.data.data
            // data structure: { type: 'text'|'action', reply: '...', tool?: '...', result?: ... }
            messages.value.push({
                role: 'ai',
                type: data.type, // 'text' or 'action'
                content: data.reply, // For text type
                tool: data.tool,
                result: data.result,
                reply: data.reply, // For action type final reply
                time: new Date()
            })
        } else {
            ElMessage.error(res.data.message || '请求失败')
        }
    } catch (err) {
        console.error(err)
        messages.value.push({
            role: 'ai',
            type: 'text',
            content: '系统连接失败，请检查网络或后端服务。',
            time: new Date()
        })
    } finally {
        loading.value = false
        scrollToBottom()
    }
}
</script>

<style scoped>
.ai-console {
    height: calc(100vh - 120px);
    padding: 20px;
    box-sizing: border-box;
}

.chat-card {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.chat-history {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    background-color: #f5f7fa;
}

.welcome-screen {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.capabilities {
    margin-top: 20px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
}

.capability-tag {
    cursor: pointer;
    transition: all 0.3s;
}

.capability-tag:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.message-row {
    display: flex;
    margin-bottom: 20px;
    align-items: flex-start;
}

.message-row.user {
    flex-direction: row-reverse;
}

.avatar {
    margin: 0 10px;
}

.message-content {
    max-width: 70%;
}

.bubble {
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    line-height: 1.6;
    position: relative;
    word-break: break-word;
}

.user .bubble {
    background-color: #409EFF;
    color: white;
    border-top-right-radius: 2px;
}

.ai .bubble {
    background-color: white;
    color: #333;
    border-top-left-radius: 2px;
    box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1);
}

.tool-result {
    font-size: 13px;
}

.tool-header {
    font-weight: bold;
    color: #E6A23C;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 5px;
}

.tool-output {
    background-color: #2d2d2d;
    color: #ccc;
    padding: 10px;
    border-radius: 4px;
    overflow-x: auto;
    margin-bottom: 10px;
    font-family: monospace;
    max-height: 200px;
}

.time {
    font-size: 12px;
    color: #999;
    margin-top: 5px;
    text-align: right;
}

.user .time {
    text-align: left;
}

.loading .dot {
    animation: dot 1.4s infinite ease-in-out both;
}

.loading .dot:nth-child(1) { animation-delay: -0.32s; }
.loading .dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes dot {
    0%, 80%, 100% { opacity: 0; }
    40% { opacity: 1; }
}

.input-area {
    padding: 20px;
    border-top: 1px solid #ebeef5;
    background-color: white;
}
</style>
