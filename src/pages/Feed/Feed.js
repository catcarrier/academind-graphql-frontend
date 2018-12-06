import React, { Component, Fragment } from 'react';
import Post from '../../components/Feed/Post/Post';
import Button from '../../components/Button/Button';
import FeedEdit from '../../components/Feed/FeedEdit/FeedEdit';
import Input from '../../components/Form/Input/Input';
import Paginator from '../../components/Paginator/Paginator';
import Loader from '../../components/Loader/Loader';
import ErrorHandler from '../../components/ErrorHandler/ErrorHandler';
import './Feed.css';

class Feed extends Component {
  state = {
    isEditing: false,
    posts: [],
    totalPosts: 0,
    editPost: null,
    status: '',
    postPage: 1,
    postsLoading: true,
    editLoading: false
  };

  componentDidMount() {
    // fetch user status via graphql
    const graphQuery = {
      query: `query {
        getUserStatus
      }`
    };

    fetch('http://localhost:8080/graphql', {
      headers: {
        Authorization: 'Bearer ' + this.props.token,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(graphQuery)
    })
      .then(res => {
        return res.json();
      })
      .then(resData => {
        if(resData.errors) {
          throw new Error('Unable to fetch user status');
        }
        this.setState({ status: resData.data.getUserStatus });
      })
      .catch(this.catchError);

    this.loadPosts();

  }

  removePost = postId => {
    this.setState(prevState => {

      // is the deleted post in-scope for the current state?
      var index = prevState.posts.findIndex(p => p._id === postId);

      if (index > -1) {
        const updatedPosts = [...prevState.posts];
        updatedPosts.splice(index, 1);
        return {
          posts: updatedPosts,
          totalPosts: prevState.totalPosts - 1
        }
      } else {
        return prevState;
      }
    })
  }


  loadPosts = direction => {
    if (direction) {
      this.setState({ postsLoading: true, posts: [] });
    }
    let page = this.state.postPage;
    if (direction === 'next') {
      page++;
      this.setState({ postPage: page });
    }
    if (direction === 'previous') {
      page--;
      this.setState({ postPage: page });
    }

    const graphQuery = {
      query: `{
        getPosts(currentPage:${page}) {
          totalPosts
          posts {
            _id
            title
            content
            imageUrl
            creator {name}
            createdAt
          }
        }
      }`
    };

    fetch('http://localhost:8080/graphql', {
      headers: {
        Authorization: 'Bearer ' + this.props.token,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(graphQuery)
    })
      .then(res => {
        return res.json();
      })
      .then(resData => {
        if (resData.errors) {
          throw new Error('Fetching posts failed!')
        }
        this.setState({
          posts: resData.data.getPosts.posts.map(post => {
            return {
              ...post,
              imagePath: post.imageUrl
            }
          }),
          totalPosts: resData.data.getPosts.totalPosts,
          postsLoading: false
        });
      })
      .catch(this.catchError);
  };

  statusUpdateHandler = event => {
    event.preventDefault();

    const graphQuery = {
      query: `mutation {
          setUserStatus(newStatus:"${this.state.status}")
        }`
    };

    fetch('http://localhost:8080/graphql', {
      headers: {
        Authorization: 'Bearer ' + this.props.token,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(graphQuery)
    })
      .then(res => {
        return res.json();
      })
      .then(resData => {
        if(resData.errors){
          console.log(resData)
          throw new Error('Unable to update user status!');
        }
        this.setState({ status: resData.data.setUserStatus });
      })
      .catch(this.catchError);
  };

  newPostHandler = () => {
    this.setState({ isEditing: true });
  };

  startEditPostHandler = postId => {
    this.setState(prevState => {
      const loadedPost = { ...prevState.posts.find(p => p._id === postId) };

      return {
        isEditing: true,
        editPost: loadedPost
      };
    });
  };

  cancelEditHandler = () => {
    this.setState({ isEditing: false, editPost: null });
  };

  finishEditHandler = postData => {
    this.setState({
      editLoading: true
    });

    // We are using graphql for our title, content etc, see below.
    // However Graphql handles only json, and we need to do a file upload 
    // for the image. For this we use a FormData to mimic a fileupload control.
    // Here we send the user's selected image via PUT, and get back the 
    // resulting path, which we then send to graphql with the rest of the fields.

    const formData = new FormData();
    formData.append('image', postData.image);
    if (this.state.editPost) {
      formData.append('oldPath', this.state.editPost.imagePath);
    }

    fetch('http://localhost:8080/postImage', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + this.props.token
      },
      body: formData
    })
      .then(res => {
        return res.json();
      })
      .then(resData => {
        // Get the path to the saved image. We will include this in the query, next.
        // graphql will not accept query containing double backslash. Here we double up
        // on the backslash.
        let imageUrl = '';
        if (resData.filePath) {
          imageUrl = resData.filePath.replace('\\', '\\\\');
        }

        let graphQuery;

        if (this.state.editPost) {
          graphQuery = {
            query: `
            mutation {
              updatePost(id: "${this.state.editPost._id}", postInput: {title: "${postData.title}", content: "${postData.content}", imageUrl: "${imageUrl}"}) {
                _id
                title
                content
                imageUrl
                creator {name}
                createdAt
              }
          }
          `
          }; // graphquery
        } else {
          graphQuery = {
            query: `mutation {
                      createPost(postInput: {
                        title: "${postData.title}", 
                        content: "${postData.content}", 
                        imageUrl: "${imageUrl}"}) {
                          _id
                          title
                          content
                          imageUrl
                          creator {name}
                          createdAt
                      }
                    }`
          } // graphquery
        } // else

        return fetch('http://localhost:8080/graphql', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + this.props.token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(graphQuery)
        })

      })
      .then(res => {
        return res.json();
      })
      .then(resData => {
        if (resData.errors) {
          throw new Error("Login failed.");
        }
        return resData;
      })
      .then(resData => {
        // If we were creating a post, the response data path is resData.data.createPost.
        // If we were updating a post the dat path is resData.data.updatePost.
        let resDataField = 'createPost';
        if (this.state.editPost) {
          resDataField = 'updatePost';
        }

        const post = {
          _id: resData.data[resDataField]._id,
          title: resData.data[resDataField].title,
          content: resData.data[resDataField].content,
          imagePath: resData.data[resDataField].imageUrl,
          creator: resData.data[resDataField].creator.name,
          createdAt: resData.data[resDataField].createdAt
        };
        this.setState(prevState => {
          let updatedPosts = [...prevState.posts];
          if (prevState.editPost) {
            const postIndex = prevState.posts.findIndex(p => p._id === prevState.editPost._id);
            updatedPosts[postIndex] = post;
          } else {
            // Remove last element and add the new one as the first element.
            // The new post will appear on the page, but the total number
            // on the page will remain the same.
            // Note the hard coded page size of 3.
            if (prevState.posts.length >= 3) {
              updatedPosts.pop();
            }
            updatedPosts.unshift(post);
          }
          return {
            posts: updatedPosts,
            isEditing: false,
            editPost: null,
            editLoading: false
          };
        });
      })
      .catch(err => {
        this.setState({
          isEditing: false,
          editPost: null,
          editLoading: false,
          error: err
        });
      });
  };

  statusInputChangeHandler = (input, value) => {
    this.setState({ status: value });
  };

  deletePostHandler = postId => {
    this.setState({ postsLoading: true });

    const graphQuery = {
      query: `
      mutation {
        deletePost(id:"${postId}"){
          _id
        }
      }
    `};

    fetch('http://localhost:8080/graphql/', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + this.props.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(graphQuery)
    })
      .then(res => {
        return res.json();
      })
      .then(resData => {
        if (resData.errors) {
          console.log(resData.errors);
          throw new Error('Deleting the post failed!');
        }
        this.loadPosts();

        // Could also do this:
        // this.setState(prevState => {
        //   const updatedPosts = prevState.posts.filter(p => p._id !== postId);
        //   return { posts: updatedPosts, postsLoading: false };
        // });
      })
      .catch(err => {
        console.log(err);
        this.setState({ postsLoading: false });
      });
  };

  errorHandler = () => {
    this.setState({ error: null });
  };

  catchError = error => {
    this.setState({ error: error });
  };

  render() {
    return (
      <Fragment>
        <ErrorHandler error={this.state.error} onHandle={this.errorHandler} />
        <FeedEdit
          editing={this.state.isEditing}
          selectedPost={this.state.editPost}
          loading={this.state.editLoading}
          onCancelEdit={this.cancelEditHandler}
          onFinishEdit={this.finishEditHandler}
        />
        <section className="feed__status">
          <form onSubmit={this.statusUpdateHandler}>
            <Input
              type="text"
              placeholder="Your status"
              control="input"
              onChange={this.statusInputChangeHandler}
              value={this.state.status}
            />
            <Button mode="flat" type="submit">
              Update
            </Button>
          </form>
        </section>
        <section className="feed__control">
          <Button mode="raised" design="accent" onClick={this.newPostHandler}>
            New Post
          </Button>
        </section>
        <section className="feed">
          {this.state.postsLoading && (
            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <Loader />
            </div>
          )}
          {this.state.posts.length <= 0 && !this.state.postsLoading ? (
            <p style={{ textAlign: 'center' }}>No posts found.</p>
          ) : null}
          {!this.state.postsLoading && (
            <Paginator
              onPrevious={this.loadPosts.bind(this, 'previous')}
              onNext={this.loadPosts.bind(this, 'next')}
              lastPage={Math.ceil(this.state.totalPosts / 3)}
              currentPage={this.state.postPage}
            >
              {this.state.posts.map(post => (
                <Post
                  key={post._id}
                  id={post._id}
                  author={post.creator.name}
                  date={new Date(post.createdAt).toLocaleDateString('en-US')}
                  title={post.title}
                  image={post.imageUrl}
                  content={post.content}
                  onStartEdit={this.startEditPostHandler.bind(this, post._id)}
                  onDelete={this.deletePostHandler.bind(this, post._id)}
                />
              ))}
            </Paginator>
          )}
        </section>
      </Fragment>
    );
  }
}

export default Feed;
