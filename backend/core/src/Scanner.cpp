#include "Scanner.h"

#include <fstream>
#include <sstream>

namespace {

std::unordered_map<std::string, TokenType> createKeywordTable() {
    return {
        {"int", TokenType::INT},
        {"float", TokenType::FLOAT},
        {"void", TokenType::VOID},
        {"if", TokenType::IF},
        {"else", TokenType::ELSE},
        {"while", TokenType::WHILE},
        {"return", TokenType::RETURN},
        {"input", TokenType::INPUT},
        {"print", TokenType::PRINT},
    };
}

}  // namespace

Token::Token(TokenType tokenType, const std::string& tokenValue)
    : type(tokenType), value(tokenValue) {}

std::string tokenTypeToString(TokenType type) {
    switch (type) {
        case TokenType::INT:
            return "INT";
        case TokenType::FLOAT:
            return "FLOAT";
        case TokenType::VOID:
            return "VOID";
        case TokenType::IF:
            return "IF";
        case TokenType::ELSE:
            return "ELSE";
        case TokenType::WHILE:
            return "WHILE";
        case TokenType::RETURN:
            return "RETURN";
        case TokenType::INPUT:
            return "INPUT";
        case TokenType::PRINT:
            return "PRINT";
        case TokenType::ID:
            return "ID";
        case TokenType::NUM:
            return "NUM";
        case TokenType::FLO:
            return "FLO";
        case TokenType::ADD:
            return "ADD";
        case TokenType::SUB:
            return "SUB";
        case TokenType::MUL:
            return "MUL";
        case TokenType::DIV:
            return "DIV";
        case TokenType::ROP:
            return "ROP";
        case TokenType::BOP:
            return "BOP";
        case TokenType::ASG:
            return "ASG";
        case TokenType::AAS:
            return "AAS";
        case TokenType::AAA:
            return "AAA";
        case TokenType::LPA:
            return "LPA";
        case TokenType::RPA:
            return "RPA";
        case TokenType::LBK:
            return "LBK";
        case TokenType::RBK:
            return "RBK";
        case TokenType::LBR:
            return "LBR";
        case TokenType::RBR:
            return "RBR";
        case TokenType::CMA:
            return "CMA";
        case TokenType::SCO:
            return "SCO";
        case TokenType::END_OF_FILE:
            return "END_OF_FILE";
        case TokenType::INVALID:
        default:
            return "INVALID";
    }
}

bool isKeywordToken(TokenType type) {
    switch (type) {
        case TokenType::INT:
        case TokenType::FLOAT:
        case TokenType::VOID:
        case TokenType::IF:
        case TokenType::ELSE:
        case TokenType::WHILE:
        case TokenType::RETURN:
        case TokenType::INPUT:
        case TokenType::PRINT:
            return true;
        default:
            return false;
    }
}

Scanner::Scanner()
    : source_(),
      pos_(0),
      length_(0),
      keywords_(createKeywordTable()),
      lastTokenType_(TokenType::INVALID),
      hasLastToken_(false) {}

bool Scanner::loadFromFile(const std::string& filename) {
    std::ifstream input(filename.c_str(), std::ios::in | std::ios::binary);
    if (!input.is_open()) {
        return false;
    }

    std::ostringstream buffer;
    buffer << input.rdbuf();
    loadFromString(buffer.str());
    return true;
}

void Scanner::loadFromString(const std::string& source) {
    source_ = source;

    // Strip a UTF-8 BOM when present to avoid reporting it as INVALID.
    if (source_.size() >= 3 &&
        static_cast<unsigned char>(source_[0]) == 0xEF &&
        static_cast<unsigned char>(source_[1]) == 0xBB &&
        static_cast<unsigned char>(source_[2]) == 0xBF) {
        source_.erase(0, 3);
    }

    length_ = source_.length();
    reset();
}

void Scanner::reset() {
    pos_ = 0;
    lastTokenType_ = TokenType::INVALID;
    hasLastToken_ = false;
}

bool Scanner::hasMoreTokens() const {
    std::size_t cursor = pos_;
    while (cursor < length_) {
        const char ch = source_[cursor];
        if (ch != ' ' && ch != '\n' && ch != '\r' && ch != '\t') {
            return true;
        }
        ++cursor;
    }

    return false;
}

Token Scanner::getNextToken() {
    skipWhitespace();
    if (isAtEnd()) {
        return makeToken(TokenType::END_OF_FILE, "");
    }

    State state = State::START;
    std::string lexeme;

    // Explicit DFA loop.
    while (true) {
        switch (state) {
            case State::START: {
                const char current = peek();

                if (isLetter(current)) {
                    lexeme += advance();
                    state = State::IDENTIFIER;
                    break;
                }

                if (isDigit(current)) {
                    lexeme += advance();
                    state = State::INTEGER;
                    break;
                }

                if (current == '.') {
                    lexeme += advance();
                    state = State::LEADING_DOT_FLOAT;
                    break;
                }

                if (current == '+' || current == '-') {
                    const bool nextIsDigit = isDigit(peekNext());
                    const bool nextStartsFraction =
                        peekNext() == '.' &&
                        (pos_ + 2 < length_) &&
                        isDigit(source_[pos_ + 2]);

                    // Treat +/- as a numeric sign only when an operand is expected.
                    if (canStartSignedNumber() && (nextIsDigit || nextStartsFraction)) {
                        lexeme += advance();
                        state = State::SIGN;
                        break;
                    }

                    if (current == '+') {
                        lexeme += advance();
                        if (peek() == '+') {
                            lexeme += advance();
                            return makeToken(TokenType::AAA, lexeme);
                        }
                        if (peek() == '=') {
                            lexeme += advance();
                            return makeToken(TokenType::AAS, lexeme);
                        }
                        return makeToken(TokenType::ADD, lexeme);
                    }

                    lexeme += advance();
                    return makeToken(TokenType::SUB, lexeme);
                }

                switch (current) {
                    case '*':
                        lexeme += advance();
                        return makeToken(TokenType::MUL, lexeme);
                    case '/':
                        lexeme += advance();
                        return makeToken(TokenType::DIV, lexeme);
                    case '=':
                        lexeme += advance();
                        if (peek() == '=') {
                            lexeme += advance();
                            return makeToken(TokenType::ROP, lexeme);
                        }
                        return makeToken(TokenType::ASG, lexeme);
                    case '<':
                    case '>':
                        lexeme += advance();
                        if (peek() == '=') {
                            lexeme += advance();
                        }
                        return makeToken(TokenType::ROP, lexeme);
                    case '!':
                        lexeme += advance();
                        if (peek() == '=') {
                            lexeme += advance();
                            return makeToken(TokenType::ROP, lexeme);
                        }
                        return makeToken(TokenType::BOP, lexeme);
                    case '&':
                        lexeme += advance();
                        if (peek() == '&') {
                            lexeme += advance();
                            return makeToken(TokenType::BOP, lexeme);
                        }
                        return makeInvalidToken(lexeme);
                    case '|':
                        lexeme += advance();
                        if (peek() == '|') {
                            lexeme += advance();
                            return makeToken(TokenType::BOP, lexeme);
                        }
                        return makeInvalidToken(lexeme);
                    case '(':
                        lexeme += advance();
                        return makeToken(TokenType::LPA, lexeme);
                    case ')':
                        lexeme += advance();
                        return makeToken(TokenType::RPA, lexeme);
                    case '[':
                        lexeme += advance();
                        return makeToken(TokenType::LBK, lexeme);
                    case ']':
                        lexeme += advance();
                        return makeToken(TokenType::RBK, lexeme);
                    case '{':
                        lexeme += advance();
                        return makeToken(TokenType::LBR, lexeme);
                    case '}':
                        lexeme += advance();
                        return makeToken(TokenType::RBR, lexeme);
                    case ',':
                        lexeme += advance();
                        return makeToken(TokenType::CMA, lexeme);
                    case ';':
                        lexeme += advance();
                        return makeToken(TokenType::SCO, lexeme);
                    default:
                        lexeme += advance();
                        return makeInvalidToken(lexeme);
                }
            }

            case State::IDENTIFIER: {
                while (isLetterOrDigit(peek())) {
                    lexeme += advance();
                }

                const auto keyword = keywords_.find(lexeme);
                if (keyword != keywords_.end()) {
                    return makeToken(keyword->second, lexeme);
                }
                return makeToken(TokenType::ID, lexeme);
            }

            case State::SIGN: {
                if (isDigit(peek())) {
                    lexeme += advance();
                    state = State::INTEGER;
                    break;
                }

                if (peek() == '.') {
                    lexeme += advance();
                    state = State::LEADING_DOT_FLOAT;
                    break;
                }

                return makeInvalidToken(lexeme);
            }

            case State::INTEGER: {
                while (isDigit(peek())) {
                    lexeme += advance();
                }

                if (peek() == '.') {
                    lexeme += advance();
                    state = State::FRACTION;
                    break;
                }

                return makeToken(TokenType::NUM, lexeme);
            }

            case State::LEADING_DOT_FLOAT: {
                if (!isDigit(peek())) {
                    return makeInvalidToken(lexeme);
                }

                while (isDigit(peek())) {
                    lexeme += advance();
                }

                return makeToken(TokenType::FLO, lexeme);
            }

            case State::FRACTION: {
                while (isDigit(peek())) {
                    lexeme += advance();
                }

                return makeToken(TokenType::FLO, lexeme);
            }
        }
    }
}

char Scanner::peek() const {
    if (isAtEnd()) {
        return '\0';
    }
    return source_[pos_];
}

char Scanner::peekNext() const {
    if (pos_ + 1 >= length_) {
        return '\0';
    }
    return source_[pos_ + 1];
}

char Scanner::advance() {
    if (isAtEnd()) {
        return '\0';
    }
    return source_[pos_++];
}

bool Scanner::isAtEnd() const {
    return pos_ >= length_;
}

void Scanner::skipWhitespace() {
    while (!isAtEnd()) {
        const char ch = peek();
        if (ch != ' ' && ch != '\n' && ch != '\r' && ch != '\t') {
            break;
        }
        ++pos_;
    }
}

bool Scanner::isLetter(char ch) const {
    return ch >= 'a' && ch <= 'z';
}

bool Scanner::isDigit(char ch) const {
    return ch >= '0' && ch <= '9';
}

bool Scanner::isLetterOrDigit(char ch) const {
    return isLetter(ch) || isDigit(ch);
}

bool Scanner::canStartSignedNumber() const {
    if (!hasLastToken_) {
        return true;
    }

    // These tokens are usually followed by a new operand.
    switch (lastTokenType_) {
        case TokenType::LPA:
        case TokenType::LBK:
        case TokenType::LBR:
        case TokenType::CMA:
        case TokenType::ASG:
        case TokenType::AAS:
        case TokenType::ROP:
        case TokenType::BOP:
        case TokenType::ADD:
        case TokenType::SUB:
        case TokenType::MUL:
        case TokenType::DIV:
        case TokenType::RETURN:
            return true;
        default:
            return false;
    }
}

void Scanner::rememberToken(const Token& token) {
    if (token.type == TokenType::END_OF_FILE || token.type == TokenType::INVALID) {
        return;
    }

    lastTokenType_ = token.type;
    hasLastToken_ = true;
}

Token Scanner::makeToken(TokenType type, const std::string& value) {
    Token token(type, value);
    rememberToken(token);
    return token;
}

Token Scanner::makeInvalidToken(const std::string& value) {
    return Token(TokenType::INVALID, value);
}
