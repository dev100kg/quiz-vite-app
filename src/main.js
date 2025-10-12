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
// ... (Firebaseの設定と初期化は変更なし) ...
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

// グローバルな状態管理変数
let currentUid = null
let userName = ''
let quizzesData = []
let currentQuizIndex = 0
let correctAnswers = 0

// ⭐ 修正: グローバルDOM変数。querySelectorの呼び出しはここで一度だけ。 ⭐
const appContainer = document.querySelector('#app')
let quizContainer = null // initializeAppAndLoadQuizで初期化
let resultContainer = null // initializeAppAndLoadQuizで初期化

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
  // ⭐ 修正: グローバル変数をそのまま利用 ⭐
  // const quizContainer = document.querySelector('#quiz-container') // 削除

  // #quiz-container の中身を入力フォームで上書きする
  quizContainer.innerHTML = `
      <h1>ニックネームを設定</h1>
      <p>このクイズで利用する名前（ランキングに表示されます）を入力してください。</p>
      <div class="row">
          <input type="text" id="username-input" class="column column-8" placeholder="あなたの名前 (例: クイズ王)" maxlength="15" value="${userName}">
          <button id="start-button" class="button button-primary column column-4">開始</button>
      </div>
  `
  // ⭐ 修正: イベントリスナーをJSで設定 (HTML属性から分離) ⭐
  const startButton = document.getElementById('start-button')
  startButton.addEventListener('click', setUserNameAndStart)

  const inputElement = document.getElementById('username-input')
  inputElement.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      setUserNameAndStart()
    }
  })

  // 結果コンテナを隠す
  // ⭐ 修正: グローバル変数をそのまま利用 ⭐
  if (resultContainer) {
    resultContainer.style.display = 'none'
  }
}

async function initializeAppAndLoadQuiz() {
  // ⭐ 修正: appContainer はグローバルで取得済み ⭐

  if (!appContainer) {
    console.error("致命的なエラー: HTMLにID='app'の要素が見つかりません。")
    return
  }

  appContainer.innerHTML = '<h1>アプリを起動しています...</h1><p>認証中...</p>'

  try {
    const userCredential = await signInAnonymously(auth)
    currentUid = userCredential.user.uid

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
    // ⭐ 修正: グローバル変数を DOM要素にリンク（代入）⭐
    quizContainer = document.querySelector('#quiz-container')
    resultContainer = document.querySelector('#result-container')

    // 認証完了後、必ず名前入力画面を表示する
    displayUserNameInput()
  } catch (error) {
    console.error('アプリ初期化エラー:', error)
    appContainer.innerHTML = `<p style="color:red;">エラー: アプリの起動に失敗しました (${error.message})</p>`
  }
}

// ユーザー名を設定し、クイズロードに進む関数 (グローバルwindow.を削除)
function setUserNameAndStart() {
  const inputElement = document.getElementById('username-input')
  let inputName = inputElement.value.trim()

  if (inputName === '') {
    inputName = `匿名ユーザー ${currentUid.substring(0, 4)}`
  }

  userName = inputName
  localStorage.setItem('quizUserName', userName)

  // ⭐ 修正: グローバル変数をそのまま利用 ⭐
  quizContainer.innerHTML = `
      <p id="status-message">ユーザー名: ${userName}</p>
      <p>クイズデータ準備中...</p>
  `

  loadQuizzes()
}
// ⭐ window.setUserNameAndStart を削除し、function setUserNameAndStart() に変更

// =========================================================
// 3. クイズデータの読み込みと出題開始
// =========================================================
async function loadQuizzes() {
  // ⭐ 修正: グローバル変数をそのまま利用 ⭐
  // const quizContainer = document.querySelector('#quiz-container') // 削除

  try {
    // ... (Firestoreの読み込みロジックは変更なし) ...
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
  // ⭐ 修正: グローバル変数をそのまま利用 ⭐
  // const quizContainer = document.querySelector('#quiz-container') // 削除

  if (currentQuizIndex >= quizzesData.length) {
    showResults()
    return
  }

  const quiz = quizzesData[currentQuizIndex]
  const userIdMessage = `<p id="status-message">ユーザー名: ${userName}</p>`
  const shuffledOptions = shuffleArray([...quiz.options])

  quizContainer.innerHTML = `
        ${userIdMessage} 
        <h2>Q.${currentQuizIndex + 1} / ${quizzesData.length}</h2>
        <p><strong>${quiz.question}</strong></p>
        
        <div id="options-list"> 
            ${shuffledOptions
              .map(
                option =>
                  // ⭐ 修正: onclickを削除し、IDとdata属性を追加 ⭐
                  `<button class="option-button column-12" 
                      data-option="${option.replace(/"/g, '')}">
                    ${option}
                   </button>`,
              )
              .join('')}
        </div>
        
        <div id="feedback"></div> 
        <p><small>正解数: ${correctAnswers}</small></p>
    `
  // ⭐ 追加: イベントリスナーをJSで設定 ⭐
  document.querySelectorAll('#options-list .option-button').forEach(button => {
    button.addEventListener('click', e => {
      const selectedOption = e.currentTarget.dataset.option
      checkAnswer(selectedOption)
    })
  })
}

// 回答チェック処理 (グローバルwindow.を削除)
function checkAnswer(selectedOption) {
  const quiz = quizzesData[currentQuizIndex]
  const feedback = document.querySelector('#feedback')
  const optionsList = document.querySelector('#options-list')

  // ... (二重回答防止、フィードバックロジックは変更なし) ...
  document.querySelectorAll('.option-button').forEach(btn => {
    btn.disabled = true
  })

  let feedbackHTML = ''
  const correctColor = 'var(--corporate-dark)'

  if (selectedOption === quiz.answer) {
    correctAnswers++
    feedbackHTML = `<p style="color: ${correctColor}; font-weight: bold; font-size: 2rem; text-align: center;">✅ 正解です！</p>`
  } else {
    feedbackHTML = `
            <p style="color: red; font-weight: bold; font-size: 2rem; text-align: center;">❌ 不正解です。</p>
            <p><strong>正解: 「${quiz.answer}」</strong></p>
            <div id="explanation-box" style="margin-top: 15px; padding: 15px; border: 1px solid #ccc; background: #f9f9f9; border-radius: 5px;">
                <h4>💡 解説</h4>
                <p>${quiz.explanation || '解説が登録されていません。'}</p>
            </div>
        `
  }

  feedback.innerHTML = feedbackHTML

  // 選択肢の代わりに「次の問題へ」ボタンを表示
  optionsList.innerHTML = `<button class="button button-primary" id="next-quiz-button">次の問題へ</button>`

  // ⭐ 追加: イベントリスナーをJSで設定 ⭐
  document
    .getElementById('next-quiz-button')
    .addEventListener('click', nextQuiz)
}

// 次の問題に進むための関数 (グローバルwindow.を削除)
function nextQuiz() {
  currentQuizIndex++
  displayQuiz()
}

// =========================================================
// 5. 結果表示とスコア登録 (Firestoreへの書き込み)
// =========================================================
async function showResults() {
  // ⭐ 修正: グローバル変数をそのまま利用 ⭐
  // const quizContainer = document.querySelector('#quiz-container') // 削除
  // const resultContainer = document.querySelector('#result-container') // 削除

  const finalScore = correctAnswers * 10
  const userIdMessage = `<p id="status-message">ユーザー名: ${userName}</p>`

  // ... (スコア登録ロジックは変更なし) ...
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
      userName: userName,
      score: finalScore,
      timestamp: serverTimestamp(),
    })

    quizContainer.innerHTML += `<p style="color:var(--corporate-dark);">✅ スコア登録が完了しました！</p>`

    resultContainer.innerHTML = `<button class="button-primary" id="load-ranking-button">ランキングを見る</button>`
    resultContainer.style.display = 'block'

    // ⭐ 追加: イベントリスナーをJSで設定 ⭐
    document
      .getElementById('load-ranking-button')
      .addEventListener('click', loadRanking)
  } catch (error) {
    // ... (エラー処理は変更なし) ...
    console.error('スコア登録エラー:', error)
    quizContainer.innerHTML += `<p style="color:red;">❌ スコア登録に失敗しました: ${error.message}</p>`
  }
}

// =========================================================
// 6. ランキング表示ロジック
// =========================================================
async function loadRanking() {
  // グローバルwindow.を削除
  // ⭐ 修正: グローバル変数をそのまま利用 ⭐
  // const quizContainer = document.querySelector('#quiz-container') // 削除

  const userIdMessage = `<p id="status-message">ユーザー名: ${userName}</p>`

  quizContainer.innerHTML = `${userIdMessage}<h2>ランキングを読み込み中...</h2>`

  try {
    // ... (Firestoreのランキング読み込みロジックは変更なし) ...
    const scoresRef = collection(db, 'scores')
    const q = query(scoresRef, orderBy('score', 'desc'), limit(10))

    const querySnapshot = await getDocs(q)

    // ... (HTML生成ロジックは変更なし) ...
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
