import './style.css'
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'

// =========================================================
// 1. 設定と初期化 (環境変数から読み込み)
// =========================================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Firebase の初期化
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

// グローバルな状態管理変数
let currentUid = null // 匿名ユーザーの UID
let userName = '' // ユーザー名を保持 (初期値)
let quizzesData = [] // 読み込んだクイズデータ（出題用）
let currentQuizIndex = 0 // 現在の出題インデックス
let correctAnswers = 0 // 正解数

// 配列をランダムにシャッフルするヘルパー関数 (Fisher-Yates)
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

// =========================================================
// 2. アプリの初期化と認証
// =========================================================

// ユーザー名入力フォームを表示する関数
function displayUserNameInput() {
  const quizContainer = document.querySelector('#quiz-container')

  // #quiz-container の中身を入力フォームで上書きする
  // userNameには localStorage から読み込んだ名前か初期値が入っている
  quizContainer.innerHTML = `
        <h1>ニックネームを設定</h1>
        <p>このクイズで利用する名前（ランキングに表示されます）を入力してください。</p>
        <div class="row">
            <input type="text" id="username-input" class="column column-8" placeholder="あなたの名前 (例: クイズ王)" maxlength="15" value="${userName}">
            <button id="start-button" class="button button-primary column column-4" onclick="window.setUserNameAndStart()">開始</button>
        </div>
    `

  // エンターキーで開始できるようにイベントを追加
  document.getElementById('username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      window.setUserNameAndStart()
    }
  })

  // 結果コンテナを隠す
  const resultContainer = document.querySelector('#result-container')
  if (resultContainer) {
    resultContainer.style.display = 'none'
  }
}

async function initializeAppAndLoadQuiz() {
  const appContainer = document.querySelector('#app')

  if (!appContainer) {
    console.error("致命的なエラー: HTMLにID='app'の要素が見つかりません。")
    return
  }

  appContainer.innerHTML = '<h1>アプリを起動しています...</h1><p>認証中...</p>'

  try {
    const userCredential = await signInAnonymously(auth)
    currentUid = userCredential.user.uid

    // localStorageから以前保存したユーザー名を読み込む (初期値として利用)
    const savedUserName = localStorage.getItem('quizUserName')
    if (savedUserName) {
      userName = savedUserName
    }

    // 基本構造を DOM に書き込む
    appContainer.innerHTML = `
        <div class="container">
            <div id="quiz-container">
                <p id="status-message">ユーザー名: ${userName}</p>
                <p>処理中...</p>
            </div>
            <div id="result-container" style="display:none;"></div>
        </div>
    `

    // 認証完了後、必ず名前入力画面を表示する
    displayUserNameInput()
  } catch (error) {
    console.error('アプリ初期化エラー:', error)
    appContainer.innerHTML = `<p style="color:red;">エラー: アプリの起動に失敗しました (${error.message})</p>`
  }
}

// ユーザー名を設定し、クイズロードに進む関数
window.setUserNameAndStart = () => {
  const inputElement = document.getElementById('username-input')
  let inputName = inputElement.value.trim()

  // 空欄の場合はデフォルト名を使用
  if (inputName === '') {
    inputName = `匿名ユーザー ${currentUid.substring(0, 4)}`
  }

  // ユーザー名をグローバル変数に保存
  userName = inputName

  // ユーザー名を localStorage に保存
  localStorage.setItem('quizUserName', userName)

  // UIを初期化し、クイズロードに進む
  const quizContainer = document.querySelector('#quiz-container')
  quizContainer.innerHTML = `
        <p id="status-message">ユーザー名: ${userName}</p>
        <p>クイズデータ準備中...</p>
    `

  loadQuizzes()
}

// ⭐ 削除: window.resetUserName 関数を削除します。

// =========================================================
// 3. クイズデータの読み込みと出題開始
// =========================================================
async function loadQuizzes() {
  const quizContainer = document.querySelector('#quiz-container')

  try {
    const quizzesRef = collection(db, 'quizzes')
    const querySnapshot = await getDocs(quizzesRef)

    const allQuizzes = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    if (allQuizzes.length === 0) {
      quizContainer.innerHTML = `<p style="color:red;">問題データがありません。</p>`
      return
    }

    // 10問をランダムに選択
    quizzesData = allQuizzes.sort(() => 0.5 - Math.random()).slice(0, 10)

    startQuiz()
  } catch (error) {
    console.error('クイズ読み込みエラー:', error)
    quizContainer.innerHTML = `<p style="color:red;">問題の読み込みに失敗しました。</p>`
  }
}

// =========================================================
// 4. クイズ出題と回答処理
// =========================================================
function startQuiz() {
  currentQuizIndex = 0
  correctAnswers = 0
  displayQuiz()
}

function displayQuiz() {
  const quizContainer = document.querySelector('#quiz-container')

  if (currentQuizIndex >= quizzesData.length) {
    showResults()
    return
  }

  const quiz = quizzesData[currentQuizIndex]

  // ユーザー名を表示するテンプレート
  const userIdMessage = `<p id="status-message">ユーザー名: ${userName}</p>`

  // オプション配列をシャッフルする
  const shuffledOptions = shuffleArray([...quiz.options]) // 元の配列を破壊しないようコピーしてからシャッフル

  quizContainer.innerHTML = `
        ${userIdMessage} 
        <h2>Q.${currentQuizIndex + 1} / ${quizzesData.length}</h2>
        <p><strong>${quiz.question}</strong></p>
        
        <div id="options-list"> 
            ${shuffledOptions
              .map(
                option =>
                  // ボタンに column-12 を適用
                  `<button class="option-button button-outline column-12" 
                      onclick="window.checkAnswer('${option.replace(/'/g, "\\'")}')">
                    ${option}
                   </button>`,
              )
              .join('')}
        </div>
        
        <div id="feedback"></div> 
        <p><small>正解数: ${correctAnswers}</small></p>
    `
}

// 回答チェック処理 (グローバル関数として定義)
window.checkAnswer = selectedOption => {
  const quiz = quizzesData[currentQuizIndex]
  const feedback = document.querySelector('#feedback')
  const optionsList = document.querySelector('#options-list')

  // 二重回答防止
  document.querySelectorAll('.option-button').forEach(btn => {
    btn.disabled = true
  })

  let feedbackHTML = ''

  // CSS変数を使って正解メッセージの色をコーポレートカラーの濃い色にする
  const correctColor = 'var(--corporate-dark)'

  if (selectedOption === quiz.answer) {
    // ✅ 正解の場合
    correctAnswers++
    feedbackHTML = `<p style="color: ${correctColor}; font-weight: bold; font-size: 2rem; text-align: center;">✅ 正解です！</p>`
  } else {
    // ❌ 不正解の場合
    feedbackHTML = `
            <p style="color: red; font-weight: bold; font-size: 2rem; text-align: center;">❌ 不正解です。</p>
            <p><strong>正解: 「${quiz.answer}」</strong></p>
            <div id="explanation-box" style="margin-top: 15px; padding: 15px; border: 1px solid #ccc; background: #f9f9f9; border-radius: 5px;">
                <h4>💡 解説</h4>
                <p>${quiz.explanation || '解説が登録されていません。'}</p>
            </div>
        `
  }

  // フィードバックと解説をまとめて表示
  feedback.innerHTML = feedbackHTML

  // 選択肢の代わりに「次の問題へ」ボタンを表示
  optionsList.innerHTML = `<button class="button button-primary" onclick="window.nextQuiz()">次の問題へ</button>`
}

// 次の問題に進むための関数
window.nextQuiz = () => {
  currentQuizIndex++
  displayQuiz()
}

// =========================================================
// 5. 結果表示とスコア登録 (Firestoreへの書き込み)
// =========================================================
async function showResults() {
  const quizContainer = document.querySelector('#quiz-container')
  const resultContainer = document.querySelector('#result-container')
  const finalScore = correctAnswers * 10

  // 結果表示時もユーザー名メッセージを維持
  const userIdMessage = `<p id="status-message">ユーザー名: ${userName}</p>`

  quizContainer.innerHTML = `
        ${userIdMessage}
        <h2>クイズ終了！</h2>
        <p>最終スコア: ${finalScore} 点</p>
        <p>スコアをデータベースに登録しています...</p>
    `

  try {
    const scoresCollection = collection(db, 'scores')
    await addDoc(scoresCollection, {
      anonymousUid: currentUid,
      // ユーザー名を保存
      userName: userName,
      score: finalScore,
      timestamp: serverTimestamp(),
    })

    quizContainer.innerHTML += `<p style="color:var(--corporate-dark);">✅ スコア登録が完了しました！</p>`

    resultContainer.innerHTML = `<button class="button-primary" onclick="window.loadRanking()">ランキングを見る</button>`
    resultContainer.style.display = 'block'
  } catch (error) {
    console.error('スコア登録エラー:', error)
    quizContainer.innerHTML += `<p style="color:red;">❌ スコア登録に失敗しました: ${error.message}</p>`
  }
}

// =========================================================
// 6. ランキング表示ロジック
// =========================================================
window.loadRanking = async () => {
  const quizContainer = document.querySelector('#quiz-container')

  // ランキング表示時もユーザー名メッセージを維持
  const userIdMessage = `<p id="status-message">ユーザー名: ${userName}</p>`

  quizContainer.innerHTML = `${userIdMessage}<h2>ランキングを読み込み中...</h2>`

  try {
    const scoresRef = collection(db, 'scores')
    const q = query(scoresRef, orderBy('score', 'desc'), limit(10))

    const querySnapshot = await getDocs(q)

    let rankingHTML = `
            ${userIdMessage}
            <div class="row">
                <div class="column">
                    <h3>🏆 上位 10 名のスコア</h3>
                    <table class="u-full-width">
                        <thead>
                            <tr>
                                <th>順位</th>
                                <th>スコア</th>
                                <th>ユーザー名</th> 
                            </tr>
                        </thead>
                        <tbody>
    `
    let rank = 1
    querySnapshot.forEach(doc => {
      const data = doc.data()
      rankingHTML += `
                <tr>
                    <td>#${rank++}</td>
                    <td><strong>${data.score} 点</strong></td>
                    <td>${data.userName || `${data.anonymousUid.substring(0, 8)}...`}</td> 
                </tr>
            `
    })
    rankingHTML += `
                        </tbody>
                    </table>
                    
                    <button class="button" onclick="window.location.reload()">もう一度プレイする</button>
                </div>
            </div>
        `

    quizContainer.innerHTML = rankingHTML
  } catch (error) {
    console.error('ランキング読み込みエラー:', error)
    quizContainer.innerHTML = `<p style="color:red;">ランキングの読み込みに失敗しました: ${error.message}</p>`
  }
}

// アプリの起動エントリポイント
initializeAppAndLoadQuiz()
