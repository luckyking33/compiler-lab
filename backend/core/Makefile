CXX ?= g++
CXXFLAGS ?= -std=c++11 -Wall -Wextra -O2
CPPFLAGS ?= -Iinclude

ifeq ($(OS),Windows_NT)
TARGET := compiler_core.exe
else
TARGET := compiler_core
endif

BUILD_DIR := build
SRC_DIR := src
SRCS := $(wildcard $(SRC_DIR)/*.cpp)
OBJS := $(patsubst $(SRC_DIR)/%.cpp,$(BUILD_DIR)/%.o,$(SRCS))

.PHONY: all clean

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(CXXFLAGS) $(OBJS) -o $@

$(BUILD_DIR)/%.o: $(SRC_DIR)/%.cpp
ifeq ($(OS),Windows_NT)
	@if not exist "$(BUILD_DIR)" mkdir "$(BUILD_DIR)"
else
	@mkdir -p $(BUILD_DIR)
endif
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -c $< -o $@

clean:
ifeq ($(OS),Windows_NT)
	@if exist "$(BUILD_DIR)" rmdir /S /Q "$(BUILD_DIR)"
	@if exist "compiler_core" del /F /Q "compiler_core"
	@if exist "compiler_core.exe" del /F /Q "compiler_core.exe"
else
	rm -rf $(BUILD_DIR) $(TARGET) $(TARGET).exe
endif
