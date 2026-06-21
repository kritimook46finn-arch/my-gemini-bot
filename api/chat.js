export default async function handler(req, res) {
    // ป้องกันไม่ให้คนอื่นยิงดึงข้อมูลเล่นนอกจากกดจากหน้าเว็บ (POST Method เท่านั้น)
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { message } = req.body;
        
        // ดึง API Key จาก Environment Variable ของ Vercel
        const apiKey = process.env.GEMINI_API_KEY; 
        
        // ส่งต่อไปยัง Google AI Studio API (ใช้ Gemini 1.5 Flash เพื่อความเร็วและประหยัด)
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: message }] }]
            })
        });

        const data = await response.json();
        
        // ดึงข้อความผลลัพธ์จากโครงสร้าง JSON ของ Google
        const reply = data.candidates[0].content.parts[0].text;

        return res.status(200).json({ reply });
    } catch (error) {
        return res.status(500).json({ error: 'เกิดข้อผิดพลาดฝั่ง Server' });
    }
}