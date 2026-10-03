import { orpc } from "../common/orpc";

// loaders
import { getAllBooks } from "./loader/getAllBooks";
import { getBookDetail } from "./loader/getBookDetail";
import { getDoneWordsOfBook } from "./loader/getDoneWordsOfBook";
import { getFavoriteWords } from "./loader/getFavoriteWords";
import { getIsWordDone } from "./loader/getIsWordDone";
import { getIsWordFavorite } from "./loader/getIsWordFavorite";
import { getMyUserInfo } from "./loader/getMyUserInfo";
import { getMyPlan } from "./loader/getMyPlan";
import { getStarBooks } from "./loader/getStarBooks";
import { getStudyCalendar } from "./loader/getStudyCalendar";
import { getStudyQueue } from "./loader/getStudyQueue";
import { getUnDoneWordsOfBook } from "./loader/getUnDoneWordsOfBook";
import { getWordCognates } from "./loader/getWordCognates";
import { getWordComments } from "./loader/getWordComments";
import { getWordDetail } from "./loader/getWordDetail";
import { getWordGraph } from "./loader/getWordGraph";
import { getWordPhrases } from "./loader/getWordPhrases";
import { getWordSentences } from "./loader/getWordSentences";
import { getWordsOfBook } from "./loader/getWordsOfBook";
import { getWordsOfKeyword } from "./loader/getWordsOfKeyword";
import { getWordSynonyms } from "./loader/getWordSynonyms";
import { getWordTranslations } from "./loader/getWordTranslations";

// actions
import { favoriteWord } from "./action/favoriteWord";
import { reviewWord } from "./action/reviewWord";
import { savePlan } from "./action/savePlan";
import { sendComment } from "./action/sendComment";
import { sendVerifyCode } from "./action/sendVerifyCode";
import { setPostVote } from "./action/setPostVote";
import { setStarBooks } from "./action/setStarBooks";
import { setWordDone } from "./action/setWordDone";
import { signIn } from "./action/signIn";
import { signOut } from "./action/signOut";
import { signUp } from "./action/signUp";
import { unfavoriteWord } from "./action/unfavoriteWord";
import { updatePassword } from "./action/updatePassword";

const loader = orpc.router({
  getMyUserInfo,
  getAllBooks,
  getBookDetail,
  getWordDetail,
  getWordGraph,
  getWordsOfKeyword,
  getWordCognates,
  getWordPhrases,
  getWordSentences,
  getWordSynonyms,
  getWordTranslations,
  getWordsOfBook,
  getIsWordDone,
  getIsWordFavorite,
  getFavoriteWords,
  getStarBooks,
  getDoneWordsOfBook,
  getUnDoneWordsOfBook,
  getStudyCalendar,
  getStudyQueue,
  getMyPlan,
  getWordComments,
});

const action = orpc.router({
  sendVerifyCode,
  signIn,
  signOut,
  signUp,
  updatePassword,
  setStarBooks,
  setWordDone,
  favoriteWord,
  unfavoriteWord,
  reviewWord,
  savePlan,
  sendComment,
  setPostVote,
});

export const router = orpc.router({ loader, action });