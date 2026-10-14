'use client'
import { useState, useRef } from 'react'
import html2canvas from 'html2canvas'
import { Shield, Download, ArrowRight, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const questions = [
  "Do you have a clear, written policy on AI usage?",
  "Do you technically restrict what data can be pasted into AI tools?",
  "Are employees trained on AI data leakage risks?",
  "Do you know which AI tools your team uses?",
  "Do you have visibility into what data is sent to AI?",
  "Can you automatically redact PII (emails, phones) before it reaches AI?",
  "Can you block secrets (API keys, passwords) from being sent to AI?",
  "Is your DLP solution running locally (privacy-first) rather than sending data to a cloud scanner?",
  "Do you receive alerts/reports when employees attempt to leak data?",
  "Is your AI security setup compliant with UAE PDPL / GDPR data minimization principles?"
]

export default function ScannerPage() {
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<boolean[]>([])
  const [showResult, setShowResult] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const handleAnswer = (answer: boolean) => {
    const newAnswers = [...answers, answer]
    setAnswers(newAnswers)

    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1)
    } else {
      setShowResult(true)
    }
  }

  const score = answers.filter(a => a).length * 10
  const riskLevel = score >= 80 ? 'Low' : score >= 50 ? 'Medium' : score >= 20 ? 'High' : 'Critical'
  const riskColor = score >= 80 ? 'text-green-500' : score >= 50 ? 'text-yellow-500' : score >= 20 ? 'text-orange-500' : 'text-red-500'
  const riskBg = score >= 80 ? 'bg-green-50 border-green-200' : score >= 50 ? 'bg-yellow-50 border-yellow-200' : score >= 20 ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200'

  const downloadCard = async () => {
    if (!cardRef.current) return
    // html2canvas captures the DOM node and renders it to a canvas
    const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: '#ffffff' })
    const link = document.createElement('a')
    link.download = `ShadowAI_Risk_Score_${score}.png`
    link.href = canvas.toDataURL()
    link.click()
  }

  const reset = () => {
    setCurrentQ(0)
    setAnswers([])
    setShowResult(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <nav className="border-b bg-white px-6 py-4 flex justify-between items-center max-w-4xl mx-auto">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold text-blue-600">
          <Shield size={24} /> ShadowAI Guard
        </Link>
        <Link href="/login" className="text-gray-600 hover:text-blue-600 font-medium">Login</Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {!showResult ? (
          <div className="bg-white p-8 rounded-2xl shadow-sm border">
            <div className="mb-8">
              <div className="flex justify-between text-sm text-gray-500 mb-2">
                <span>Question {currentQ + 1} of {questions.length}</span>
                <span>{Math.round(((currentQ) / questions.length) * 100)}% complete</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${(currentQ / questions.length) * 100}%` }}></div>
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-8">{questions[currentQ]}</h2>

            <div className="flex gap-4">
              <button onClick={() => handleAnswer(true)} className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition text-lg">Yes</button>
              <button onClick={() => handleAnswer(false)} className="flex-1 py-4 bg-red-50 text-red-600 border border-red-200 rounded-xl font-semibold hover:bg-red-100 transition text-lg">No</button>
            </div>

            {currentQ > 0 && (
              <button onClick={() => setCurrentQ(currentQ - 1)} className="mt-6 text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <ArrowLeft size={16} /> Previous
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-2">Your AI Leak Risk Score</h2>
              <p className="text-gray-600">Based on your answers, here is your organization's current risk level.</p>
            </div>

            {/* The Card to be captured by html2canvas */}
            <div ref={cardRef} className={`p-8 rounded-2xl border-2 ${riskBg} text-center max-w-md mx-auto`}>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm">
                  <Shield size={32} className="text-blue-600" />
                </div>
              </div>
              <p className="text-gray-500 font-medium mb-2">ShadowAI Guard Risk Scanner</p>
              <p className={`text-7xl font-bold ${riskColor} mb-2`}>{score}</p>
              <p className={`text-xl font-bold ${riskColor} mb-4`}>{riskLevel} Risk</p>
              <div className="border-t border-gray-200 pt-4 mt-4">
                <p className="text-sm text-gray-600">Scan taken on {new Date().toLocaleDateString()}</p>
              </div>
            </div>

            <div className="flex gap-4 justify-center">
              <button onClick={downloadCard} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 flex items-center gap-2">
                <Download size={18} /> Download Score Card
              </button>
              <button onClick={reset} className="border border-gray-300 px-6 py-3 rounded-lg font-semibold hover:bg-gray-50">
                Retake Quiz
              </button>
            </div>

            <div className="bg-white p-6 rounded-xl border text-center">
              <h3 className="text-xl font-bold mb-2">Ready to fix your score?</h3>
              <p className="text-gray-600 mb-4">ShadowAI Guard automatically redacts and blocks sensitive data across all AI tools and web forms. 100% local, privacy-first.</p>
              <Link href="/login" className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700">
                Start Free Trial <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
