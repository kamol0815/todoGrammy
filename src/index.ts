import { Bot } from "grammy";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config();

const prisma = new PrismaClient();
const bot = new Bot(process.env.BOT_TOKEN!);

async function checkReminders() {
    try {
        const now = new Date();
        const reminderTime = new Date(now.getTime() + 5 * 60000); // 5 daqiqa keyin
        const pastTime = new Date(now.getTime() - 5 * 60000); // 5 daqiqa oldin

        const tasksToRemind = await prisma.task.findMany({
            where: {
                status: 'ACTIVE',
                dueDate: { gte: pastTime, lte: reminderTime },
                reminderSent: false
            },
            include: { user: true }
        });

        for (const task of tasksToRemind) {
            try {
                const timeLeft = Math.round((task.dueDate.getTime() - now.getTime()) / 60000);

                let message = `⏰ **Eslatma!**\n\n📝 **${task.name}**\n`;
                message += `📅 Muddat: ${task.dueDate.toLocaleString('uz-UZ', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                })}\n`;

                if (timeLeft > 0) message += `⏳ ${timeLeft} daqiqa qoldi`;
                else if (timeLeft === 0) message += `🔔 Vazifa vaqti keldi!`;
                else message += `⚠️ Vazifa ${Math.abs(timeLeft)} daqiqa kechikdi!`;

                await bot.api.sendMessage(task.user.telegramId, message, {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [[
                            { text: "✅ Bajarildi", callback_data: `complete_${task.id}` },
                            { text: "📋 Vazifalar", callback_data: "show_tasks" }
                        ]]
                    }
                });

                await prisma.task.update({
                    where: { id: task.id },
                    data: { reminderSent: true }
                });
            } catch (error) {
                continue;
            }
        }
    } catch (error) {

    }
}
setInterval(checkReminders, 60000);

async function getUser(telegramId: string) {
    let user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
        user = await prisma.user.create({ data: { telegramId } });
    }
    return user;
}

function parseDateTime(args: string) {
    const parts = args.split(' ');
    let taskName = args;
    let dueDate = new Date();
    let priority = 'LOW';

    if (parts.length >= 2) {
        const dateStr = parts[parts.length - 2];
        const timeStr = parts[parts.length - 1];

        const dateRegex = /^\d{1,2}\.\d{1,2}\.(\d{2}|\d{4})$/;
        const timeRegex = /^\d{1,2}:\d{2}$/;

        if (dateRegex.test(dateStr) && timeRegex.test(timeStr)) {
            taskName = parts.slice(0, -2).join(' ');

            const [day, month, yearStr] = dateStr.split('.');
            const [hour, minute] = timeStr.split(':').map(Number);

            let year = parseInt(yearStr);
            if (year < 100) year = 2000 + year;

            dueDate = new Date(year, parseInt(month) - 1, parseInt(day), hour, minute);
        }
    }    // Prioritetni tekshirish (oxirgi so'z)
    if (parts.length >= 3) {
        const lastPart = parts[parts.length - 1].toLowerCase();
        const secondLastPart = parts[parts.length - 2];

        // Agar oxirgi so'z prioritet bo'lsa va undan oldingi so'z vaqt formatida bo'lsa
        if (['easy', 'medium', 'hard'].includes(lastPart) && /^\d{1,2}:\d{2}$/.test(secondLastPart)) {
            // easy -> LOW, medium -> MEDIUM, hard -> HIGH
            if (lastPart === 'easy') priority = 'LOW';
            else if (lastPart === 'medium') priority = 'MEDIUM';
            else if (lastPart === 'hard') priority = 'HIGH';

            // Vazifa nomini qayta hisoblash (prioritetsiz)
            const dateStr = parts[parts.length - 3];
            const timeStr = parts[parts.length - 2];

            if (/^\d{1,2}\.\d{1,2}\.(\d{2}|\d{4})$/.test(dateStr)) {
                taskName = parts.slice(0, -3).join(' ');

                const [day, month, yearStr] = dateStr.split('.');
                const [hour, minute] = timeStr.split(':').map(Number);

                let year = parseInt(yearStr);
                if (year < 100) year = 2000 + year;

                dueDate = new Date(year, parseInt(month) - 1, parseInt(day), hour, minute);
            }
        }
    }

    return { taskName, dueDate, priority };
}

function formatDate(date: Date) {
    return date.toLocaleString('uz-UZ', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
}

function getTaskIcons(task: any) {
    const statusIcon = task.status === 'COMPLETED' ? '✅' : '⏳';
    const priorityIcon = task.priority === 'HIGH' ? '🔴' :
        task.priority === 'MEDIUM' ? '🟡' : '🟢';
    return { statusIcon, priorityIcon };
}

function getPriorityText(priority: string) {
    if (priority === 'HIGH') return '🔴 Qiyin (Hard)';
    if (priority === 'MEDIUM') return '🟡 O\'rta (Medium)';
    return '🟢 Oson (Easy)';
}

bot.command("start", (ctx) => {
    ctx.reply(`🤖 **To-Do Bot'ga xush kelibsiz!** 👋

Men sizning vazifalaringizni boshqarishga yordam beruvchi botman.

📋 **Asosiy buyruqlar:**

📝 **/add** - Yangi vazifa qo'shish
   Format: /add [vazifa nomi] [sana] [vaqt] [darajasi]
   Misol: /add Kitob o'qish 25.12.25 09:00 hard
   Darajalar: easy, medium, hard

✅ **/complete** - Vazifani bajarilgan deb belgilash
   Misol: /complete 1

🗑️ **/delete** - Vazifani o'chirish
   Misol: /delete 1

📋 **/tasks** - Barcha vazifalar ro'yxati

🔥 **Qo'shimcha imkoniyatlar:**
• ⏰ Avtomatik eslatmalar
• 🏷️ Vazifa darajalari (Easy/Medium/Hard)
• 📱 Raqam orqali tez kirish
• 📊 Vazifalar statistikasi

💡 **Maslahat:** Faqat vazifa raqamini yuboring (masalan: "1") - tez kirishga ega bo'lasiz!

📅 **Sana/vaqt formati:** 
dd.mm.yy hh:mm yoki dd.mm.yyyy hh:mm`);
});

bot.command("add", async (ctx) => {
    const args = ctx.message?.text?.split(' ').slice(1).join(' ');

    if (!args) {
        await ctx.reply(`📝 **Vazifa qo'shish yo'riqnomasi:**

🔹 **Format:** /add [vazifa nomi] [sana] [vaqt] [darajasi]
🔹 **Misol:** /add Kitob o'qish 25.12.25 09:00 hard

📅 **Sana formati:** dd.mm.yy yoki dd.mm.yyyy
⏰ **Vaqt formati:** hh:mm
🏷️ **Darajalar:** easy, medium, hard

Vazifa qo'shish uchun yuqoridagi formatdan foydalaning.`);
        return;
    }

    try {
        const telegramId = ctx.from?.id?.toString();
        if (!telegramId) {
            await ctx.reply("Xatolik yuz berdi. Qayta urinib ko'ring.");
            return;
        }

        const user = await getUser(telegramId);
        const { taskName, dueDate, priority } = parseDateTime(args);

        // Vazifani yaratish
        const task = await prisma.task.create({
            data: {
                name: taskName,
                dueDate,
                userId: user.id,
                priority: priority as 'LOW' | 'MEDIUM' | 'HIGH'
            }
        });

        const taskCount = await prisma.task.count({ where: { userId: user.id } });

        const priorityText = priority === 'HIGH' ? '🔴 Yuqori' :
            priority === 'MEDIUM' ? '🟡 O\'rta' : '🟢 Past';

        await ctx.reply(`✅ **Vazifa muvaffaqiyatli qo'shildi!**

📝 **${task.name}**
📅 Muddat: ${formatDate(dueDate)}
�️ Prioritet: ${priorityText}
🆔 ID: ${taskCount}

Vazifa eslatma tizimiga qo'shildi!`);

    } catch (error) {
        await ctx.reply("Vazifa qo'shishda xatolik yuz berdi. Qayta urinib ko'ring.");
    }
});

bot.command("tasks", async (ctx) => {
    try {
        const telegramId = ctx.from?.id?.toString();
        if (!telegramId) {
            await ctx.reply("Xatolik yuz berdi. Qayta urinib ko'ring.");
            return;
        }

        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) {
            await ctx.reply("📋 Sizda hali vazifalar yo'q.\n\n/add buyrug'i bilan yangi vazifa qo'shing!");
            return;
        }

        const tasks = await prisma.task.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' }
        });

        if (tasks.length === 0) {
            await ctx.reply("📋 Sizda hali vazifalar yo'q.\n\n/add buyrug'i bilan yangi vazifa qo'shing!");
            return;
        }

        // Vazifalar statistikasi
        const activeTasks = tasks.filter(task => task.status === 'ACTIVE').length;
        const completedTasks = tasks.filter(task => task.status === 'COMPLETED').length;

        let message = `📋 **Vazifalar ro'yxati**\n\n`;
        message += `📊 **Statistika:** ${activeTasks} faol, ${completedTasks} bajarilgan\n\n`;

        tasks.forEach((task, index) => {
            const { statusIcon, priorityIcon } = getTaskIcons(task);
            const statusText = task.status === 'COMPLETED' ? 'Bajarilgan' : 'Faol';
            const priorityText = task.priority === 'HIGH' ? 'Yuqori' :
                task.priority === 'MEDIUM' ? 'O\'rta' : 'Past';

            message += `${statusIcon} ${priorityIcon} **${index + 1}. ${task.name}**\n`;
            message += `📅 ${formatDate(task.dueDate)}\n`;
            message += `🏷️ Prioritet: ${priorityText} | Holat: ${statusText}\n\n`;
        });

        message += `💡 **Ishlatish:** Vazifa raqamini yozing (masalan: 1)`;

        await ctx.reply(message, { parse_mode: "Markdown" });

    } catch (error) {
        await ctx.reply("Vazifalar ro'yxatini olishda xatolik yuz berdi.");
    }
});

bot.command("complete", async (ctx) => {
    const args = ctx.message?.text?.split(' ').slice(1);
    const taskId = args?.[0];

    if (!taskId || isNaN(Number(taskId))) {
        await ctx.reply("Vazifa ID'sini kiriting!\n\nMisol: /complete 1");
        return;
    }

    try {
        const telegramId = ctx.from?.id?.toString();
        if (!telegramId) {
            await ctx.reply("Xatolik yuz berdi. Qayta urinib ko'ring.");
            return;
        }

        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) {
            await ctx.reply("Sizda vazifalar yo'q.");
            return;
        }

        const tasks = await prisma.task.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' }
        });

        const taskIndex = Number(taskId) - 1;
        if (taskIndex < 0 || taskIndex >= tasks.length) {
            await ctx.reply("Bunday ID'li vazifa topilmadi!");
            return;
        }

        const task = tasks[taskIndex];
        if (task.status === 'COMPLETED') {
            await ctx.reply("Bu vazifa allaqachon bajarilgan!");
            return;
        }

        await prisma.task.update({
            where: { id: task.id },
            data: { status: 'COMPLETED' }
        });

        await ctx.reply(`✅ Vazifa bajarilgan deb belgilandi!\n\n📝 **${task.name}**\nTabriklaymiz!`);

    } catch (error) {
        await ctx.reply("Vazifani bajarilgan deb belgilashda xatolik yuz berdi.");
    }
});

bot.command("delete", async (ctx) => {
    const args = ctx.message?.text?.split(' ').slice(1);
    const taskId = args?.[0];

    if (!taskId || isNaN(Number(taskId))) {
        await ctx.reply("Vazifa ID'sini kiriting!\n\nMisol: /delete 1");
        return;
    }

    try {
        const telegramId = ctx.from?.id?.toString();
        if (!telegramId) {
            await ctx.reply("Xatolik yuz berdi. Qayta urinib ko'ring.");
            return;
        }

        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) {
            await ctx.reply("Sizda vazifalar yo'q.");
            return;
        }

        const tasks = await prisma.task.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' }
        });

        const taskIndex = Number(taskId) - 1;
        if (taskIndex < 0 || taskIndex >= tasks.length) {
            await ctx.reply("Bunday ID'li vazifa topilmadi!");
            return;
        }

        const task = tasks[taskIndex];
        const { statusIcon } = getTaskIcons(task);

        await ctx.reply(`${statusIcon} **${task.name}**
📅 ${formatDate(task.dueDate)}
🆔 ID: ${taskId}

Bu vazifani o'chirmoqchimisiz?`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: "✅ Ha, o'chirish", callback_data: `confirm_delete_${task.id}` },
                    { text: "❌ Bekor qilish", callback_data: `cancel_delete` }
                ]]
            }
        });

    } catch (error) {
        await ctx.reply("Vazifani ko'rsatishda xatolik yuz berdi.");
    }
});


bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();

    if (/^\d+$/.test(text) && !text.startsWith('/')) {
        const taskId = text;

        try {
            const telegramId = ctx.from?.id?.toString();
            if (!telegramId) {
                await ctx.reply("Xatolik yuz berdi. Qayta urinib ko'ring.");
                return;
            }

            const user = await prisma.user.findUnique({ where: { telegramId } });
            if (!user) {
                await ctx.reply("Sizda vazifalar yo'q.");
                return;
            }

            const tasks = await prisma.task.findMany({
                where: { userId: user.id },
                orderBy: { createdAt: 'desc' }
            });

            const taskIndex = Number(taskId) - 1;
            if (taskIndex < 0 || taskIndex >= tasks.length) {
                await ctx.reply("Bunday ID'li vazifa topilmadi!");
                return;
            }

            const task = tasks[taskIndex];
            const { statusIcon } = getTaskIcons(task);

            await ctx.reply(`${statusIcon} **${task.name}**
📅 ${formatDate(task.dueDate)}
🆔 ID: ${taskId}

Nima qilmoqchisiz?`, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: "✅ Bajarildi", callback_data: `complete_${task.id}` },
                        { text: "🗑️ O'chirish", callback_data: `delete_${task.id}` }
                    ]]
                }
            });

        } catch (error) {
            await ctx.reply("Vazifani ko'rsatishda xatolik yuz berdi.");
        }
    }
});


bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    // Prioritet tanlash
    if (data.startsWith('priority_')) {
        const [, priority, taskId] = data.split('_');

        try {
            const task = await prisma.task.update({
                where: { id: taskId },
                data: { priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' }
            });

            const priorityText = priority === 'HIGH' ? '🔴 Yuqori' :
                priority === 'MEDIUM' ? '🟡 O\'rta' : '🟢 Past';

            await ctx.editMessageText(`✅ **Vazifa muvaffaqiyatli qo'shildi!**

📝 **${task.name}**
📅 Muddat: ${formatDate(task.dueDate)}
🏷️ Prioritet: ${priorityText}

Vazifa eslatma tizimiga qo'shildi!`);

            await ctx.answerCallbackQuery("Prioritet o'rnatildi!");

        } catch (error) {
            await ctx.answerCallbackQuery("Xatolik yuz berdi!");
        }
    }

    // Vazifa tafsilotlarini ko'rsatish
    else if (data.startsWith('show_')) {
        const taskId = data.replace('show_', '');

        try {
            const task = await prisma.task.findUnique({ where: { id: taskId } });
            if (!task) {
                await ctx.answerCallbackQuery("Vazifa topilmadi!");
                return;
            }

            const { statusIcon, priorityIcon } = getTaskIcons(task);
            const statusText = task.status === 'COMPLETED' ? 'Bajarilgan' : 'Faol';
            const priorityText = task.priority === 'HIGH' ? 'Yuqori' :
                task.priority === 'MEDIUM' ? 'O\'rta' : 'Past';

            await ctx.editMessageText(`${statusIcon} **${task.name}**
📅 ${formatDate(task.dueDate)}
🏷️ Prioritet: ${priorityIcon} ${priorityText}
📊 Holat: ${statusText}

Nima qilmoqchisiz?`, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ Bajarildi", callback_data: `complete_${task.id}` },
                            { text: "🗑️ O'chirish", callback_data: `delete_${task.id}` }
                        ],
                        [{ text: "🔙 Orqaga", callback_data: "back_to_tasks" }]
                    ]
                }
            });

            await ctx.answerCallbackQuery();
        } catch (error) {
            await ctx.answerCallbackQuery("Xatolik yuz berdi!");
        }
    }

    // Vazifalar ro'yxatiga qaytish
    else if (data === 'back_to_tasks' || data === 'show_tasks') {
        const telegramId = ctx.from?.id?.toString();
        if (!telegramId) return;

        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) {
            await ctx.answerCallbackQuery("Foydalanuvchi topilmadi!");
            return;
        }

        const tasks = await prisma.task.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' }
        });

        if (tasks.length === 0) {
            await ctx.editMessageText("📋 Sizda hozircha vazifalar yo'q. Vazifa qo'shish uchun /add buyrug'idan foydalaning.");
            await ctx.answerCallbackQuery();
            return;
        }

        const taskButtons = tasks.map((task, index) => {
            const { statusIcon, priorityIcon } = getTaskIcons(task);
            const buttonText = `${statusIcon} ${priorityIcon} ${index + 1}. ${task.name}`;
            return [{ text: buttonText, callback_data: `show_${task.id}` }];
        });

        await ctx.editMessageText("📋 **Sizning vazifalaringiz:**\n\nVazifa tafsilotlarini ko'rish uchun tugmani bosing:", {
            reply_markup: { inline_keyboard: taskButtons },
            parse_mode: "Markdown"
        });

        await ctx.answerCallbackQuery();
    }

    // Vazifani bajarish
    else if (data.startsWith('complete_')) {
        const taskId = data.replace('complete_', '');

        try {
            const task = await prisma.task.findUnique({ where: { id: taskId } });
            if (!task) {
                await ctx.answerCallbackQuery("Vazifa topilmadi!");
                return;
            }

            if (task.status === 'COMPLETED') {
                await ctx.answerCallbackQuery("Bu vazifa allaqachon bajarilgan!");
                return;
            }

            await prisma.task.update({
                where: { id: taskId },
                data: { status: 'COMPLETED' }
            });

            await ctx.editMessageText(`✅ Vazifa bajarilgan deb belgilandi!\n\n📝 **${task.name}**\nTabriklaymiz!`);
            await ctx.answerCallbackQuery("Vazifa bajarildi!");

        } catch (error) {
            await ctx.answerCallbackQuery("Xatolik yuz berdi!");
        }
    }

    // O'chirish tasdiqlashi
    else if (data.startsWith('delete_')) {
        const taskId = data.replace('delete_', '');

        try {
            const task = await prisma.task.findUnique({ where: { id: taskId } });
            if (!task) {
                await ctx.answerCallbackQuery("Vazifa topilmadi!");
                return;
            }

            const { statusIcon } = getTaskIcons(task);

            await ctx.editMessageText(`${statusIcon} **${task.name}**
📅 ${formatDate(task.dueDate)}

Bu vazifani o'chirmoqchimisiz?`, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: "✅ Ha, o'chirish", callback_data: `confirm_delete_${task.id}` },
                        { text: "❌ Bekor qilish", callback_data: `show_${task.id}` }
                    ]]
                }
            });

            await ctx.answerCallbackQuery();
        } catch (error) {
            await ctx.answerCallbackQuery("Xatolik yuz berdi!");
        }
    }

    // O'chirishni tasdiqlash
    else if (data.startsWith('confirm_delete_')) {
        const taskId = data.replace('confirm_delete_', '');

        try {
            const task = await prisma.task.findUnique({ where: { id: taskId } });
            if (!task) {
                await ctx.answerCallbackQuery("Vazifa topilmadi!");
                return;
            }

            await prisma.task.delete({ where: { id: taskId } });

            await ctx.editMessageText(`🗑️ Vazifa o'chirildi!\n\n📝 **${task.name}**\nMuvaffaqiyatli o'chirildi.`);
            await ctx.answerCallbackQuery("Vazifa o'chirildi!");

        } catch (error) {
            await ctx.answerCallbackQuery("Xatolik yuz berdi!");
        }
    }

    // O'chirishni bekor qilish
    else if (data === 'cancel_delete') {
        await ctx.editMessageText("❌ O'chirish bekor qilindi.");
        await ctx.answerCallbackQuery("Bekor qilindi");
    }
});

// ===============================
// BOT ISHGA TUSHIRISH
// ===============================

bot.catch((err) => {
    console.error("Bot xatoligi:", err);
});

// Webhook o‘rnatilgan bo‘lsa, polling ishlamaydi.
// Pollingdan foydalanish uchun webhookni o‘chirib yuboramiz va keyin botni ishga tushiramiz.
(async () => {
    try {
        await bot.api.deleteWebhook({ drop_pending_updates: true });
        await bot.start();
    } catch (err) {
        console.error("Bot ishga tushmadi:", err);
    }
})();
